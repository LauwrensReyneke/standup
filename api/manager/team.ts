import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { badMethod, json } from '../_lib/http.js'
import { readSession } from '../_lib/auth.js'
import { ensureBootstrapTeamAndManager, ensureTeamForViewer, getTeam, usersKey, findBlob, saveTeam, getUserByEmail, upsertUser, getRoleForTeam, addUserToTeam, removeUserFromTeam } from '../_lib/store.js'
import { readJson } from '../_lib/blob.js'

const AddBody = z.object({ email: z.string().email(), name: z.string().min(1) })
const RemoveBody = z.object({ userId: z.string().min(5) })
const UpdateTeamBody = z.object({ teamName: z.string().min(1).max(80) })
const CutoffBody = z.object({ standupCutoffTime: z.string().regex(/^\d{2}:\d{2}$/) })

async function fetchMembers(teamId: string, team: { memberUserIds: string[] }) {
  const members = [] as any[]
  for (const uid of team.memberUserIds) {
    const b = await findBlob(usersKey(uid))
    if (!b) continue
    const { data } = await readJson<any>(b.url)
    members.push({ userId: data.id, name: data.name, email: data.email, role: getRoleForTeam(data, teamId) })
  }
  members.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }))
  return members
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureBootstrapTeamAndManager()

  const viewer = await readSession(req)
  if (!viewer) return json(res, 401, { error: 'Unauthorized' })
  if (viewer.role !== 'manager') return json(res, 403, { error: 'Manager only' })

  // Self-heal: if the session/user references a missing team blob, recreate it.
  await ensureTeamForViewer(viewer)

  const teamId = viewer.activeTeamId || viewer.teamId
  const team = await getTeam(teamId)
  if (!team) return json(res, 404, { error: 'Team not found' })

  // GET /api/manager/team
  if (req.method === 'GET') {
    const members = await fetchMembers(teamId, team)
    return json(res, 200, {
      teamId: team.id,
      teamName: team.name,
      standupCutoffTime: team.standupCutoffTime,
      members,
    })
  }

  // PUT /api/manager/team
  // Supports either:
  // - { teamName }
  // - { standupCutoffTime }
  if (req.method === 'PUT') {
    const teamNameBody = UpdateTeamBody.safeParse(req.body)
    if (teamNameBody.success) {
      team.name = teamNameBody.data.teamName.trim()
      await saveTeam(team)
      const members = await fetchMembers(teamId, team)
      return json(res, 200, {
        teamId: team.id,
        teamName: team.name,
        standupCutoffTime: team.standupCutoffTime,
        members,
      })
    }

    const cutoffBody = CutoffBody.safeParse(req.body)
    if (cutoffBody.success) {
      team.standupCutoffTime = cutoffBody.data.standupCutoffTime
      await saveTeam(team)
      const members = await fetchMembers(teamId, team)
      return json(res, 200, {
        teamId: team.id,
        teamName: team.name,
        standupCutoffTime: team.standupCutoffTime,
        members,
      })
    }

    return json(res, 400, { error: 'Invalid request body' })
  }

  // POST /api/manager/team
  // Add member: { email, name }
  if (req.method === 'POST') {
    const body = AddBody.safeParse(req.body)
    if (!body.success) return json(res, 400, { error: 'Invalid request body' })

    const email = body.data.email.toLowerCase()
    const existing = await getUserByEmail(email)

    const now = new Date().toISOString()
    const user = existing
      ? { ...existing, name: body.data.name, teamId: team.id }
      : {
          id: nanoid(),
          email,
          name: body.data.name,
          role: 'member' as const,
          teamId: team.id,
          createdAt: now,
          updatedAt: now,
        }

    await upsertUser(user)
    if (!team.memberUserIds.includes(user.id)) team.memberUserIds.push(user.id)
    await saveTeam(team)

    await addUserToTeam({ teamId: team.id, userId: user.id, role: 'member' })

    const members = await fetchMembers(teamId, team)
    return json(res, 200, {
      teamId: team.id,
      teamName: team.name,
      standupCutoffTime: team.standupCutoffTime,
      members,
    })
  }

  // DELETE /api/manager/team (remove member)
  if (req.method === 'DELETE') {
    const body = RemoveBody.safeParse(req.body)
    if (!body.success) return json(res, 400, { error: 'Invalid request body' })

    team.memberUserIds = team.memberUserIds.filter((id) => id !== body.data.userId)
    await saveTeam(team)

    await removeUserFromTeam({ teamId: team.id, userId: body.data.userId })

    const members = await fetchMembers(teamId, team)
    return json(res, 200, {
      teamId: team.id,
      teamName: team.name,
      standupCutoffTime: team.standupCutoffTime,
      members,
    })
  }

  return badMethod(req, res, ['GET', 'POST', 'PUT', 'DELETE'])
}
