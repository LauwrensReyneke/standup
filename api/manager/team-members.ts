import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { badMethod, json } from '../_lib/http.js'
import { readSession } from '../_lib/auth.js'
import {
  ensureBootstrapTeamAndManager,
  ensureTeamForViewer,
  getTeam,
  usersKey,
  findBlob,
  getUserByEmail,
  upsertUser,
  addUserToTeam,
  removeUserFromTeam,
  setUserRoleForTeam,
  getRoleForTeam,
} from '../_lib/store.js'
import { readJson } from '../_lib/blob.js'

const AddBody = z.object({ email: z.string().email(), name: z.string().min(1), role: z.enum(['manager', 'member']).optional() })
const RemoveBody = z.object({ userId: z.string().min(5) })
const RoleBody = z.object({ userId: z.string().min(5), role: z.enum(['manager', 'member']) })

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

  const activeTeamId = viewer.activeTeamId || viewer.teamId
  const team = await getTeam(activeTeamId)
  if (!team) return json(res, 404, { error: 'Team not found' })

  // GET /api/manager/team-members
  if (req.method === 'GET') {
    const members = await fetchMembers(activeTeamId, team)
    return json(res, 200, { teamId: team.id, teamName: team.name, standupCutoffTime: team.standupCutoffTime, members })
  }

  // POST /api/manager/team-members (add member)
  if (req.method === 'POST') {
    const body = AddBody.safeParse(req.body)
    if (!body.success) return json(res, 400, { error: 'Invalid request body' })

    const email = body.data.email.toLowerCase()
    const existing = await getUserByEmail(email)

    const now = new Date().toISOString()
    const user = existing
      ? { ...existing, name: body.data.name }
      : {
          id: nanoid(),
          email,
          name: body.data.name,
          role: 'member' as const,
          teamId: activeTeamId,
          createdAt: now,
          updatedAt: now,
        }

    await upsertUser(user)

    await addUserToTeam({ teamId: activeTeamId, userId: user.id, role: body.data.role || 'member' })

    const refreshed = await getTeam(activeTeamId)
    const members = refreshed ? await fetchMembers(activeTeamId, refreshed) : []

    return json(res, 200, { teamId: team.id, teamName: team.name, standupCutoffTime: team.standupCutoffTime, members })
  }

  // PUT /api/manager/team-members (update role)
  if (req.method === 'PUT') {
    const body = RoleBody.safeParse(req.body)
    if (!body.success) return json(res, 400, { error: 'Invalid request body' })

    // Don't allow demoting yourself out of manager for the active team.
    if (body.data.userId === viewer.id && body.data.role !== 'manager') {
      return json(res, 400, { error: "You can't remove your own manager access" })
    }

    const updated = await setUserRoleForTeam({ teamId: activeTeamId, userId: body.data.userId, role: body.data.role })
    if (!updated) return json(res, 404, { error: 'User not found' })

    // keep legacy fields coherent for that user
    if ((updated.activeTeamId || updated.teamId) === activeTeamId) {
      updated.teamId = activeTeamId
      updated.role = getRoleForTeam(updated, activeTeamId)
      await upsertUser(updated)
    }

    const refreshed = await getTeam(activeTeamId)
    const members = refreshed ? await fetchMembers(activeTeamId, refreshed) : []
    return json(res, 200, { teamId: team.id, teamName: team.name, standupCutoffTime: team.standupCutoffTime, members })
  }

  // DELETE /api/manager/team-members (remove member)
  if (req.method === 'DELETE') {
    const body = RemoveBody.safeParse(req.body)
    if (!body.success) return json(res, 400, { error: 'Invalid request body' })

    // Prevent removing yourself from the active team.
    if (body.data.userId === viewer.id) {
      return json(res, 400, { error: "You can't remove yourself from the active team" })
    }

    await removeUserFromTeam({ teamId: activeTeamId, userId: body.data.userId })

    const refreshed = await getTeam(activeTeamId)
    const members = refreshed ? await fetchMembers(activeTeamId, refreshed) : []
    return json(res, 200, { teamId: team.id, teamName: team.name, standupCutoffTime: team.standupCutoffTime, members })
  }

  return badMethod(req, res, ['GET', 'POST', 'PUT', 'DELETE'])
}
