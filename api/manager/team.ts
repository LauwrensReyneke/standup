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
  saveTeam,
  getUserByEmail,
  upsertUser,
} from '../_lib/store.js'
import { readJson } from '../_lib/blob.js'

const AddBody = z.object({ email: z.string().email(), name: z.string().min(1) })
const RemoveBody = z.object({ userId: z.string().min(5) })
const UpdateTeamBody = z.object({ teamName: z.string().min(1).max(80) })

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureBootstrapTeamAndManager()

  const viewer = readSession(req)
  if (!viewer) return json(res, 401, { error: 'Unauthorized' })
  if (viewer.role !== 'manager') return json(res, 403, { error: 'Manager only' })

  // Self-heal: if the session/user references a missing team blob, recreate it.
  await ensureTeamForViewer(viewer)

  const team = await getTeam(viewer.teamId)
  if (!team) return json(res, 404, { error: 'Team not found' })

  // GET /api/manager/team
  if (req.method === 'GET') {
    const members = [] as any[]
    for (const uid of team.memberUserIds) {
      const b = await findBlob(usersKey(uid))
      if (!b) continue
      const { data } = await readJson<any>(b.url)
      members.push({ userId: data.id, name: data.name, email: data.email, role: data.role })
    }

    members.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }))

    return json(res, 200, {
      teamId: team.id,
      teamName: team.name,
      standupCutoffTime: team.standupCutoffTime,
      members,
    })
  }

  // PUT /api/manager/team (update team metadata)
  if (req.method === 'PUT') {
    const body = UpdateTeamBody.safeParse(req.body)
    if (!body.success) return json(res, 400, { error: 'Invalid request body' })

    team.name = body.data.teamName.trim()
    await saveTeam(team)

    // Return the same shape as GET for convenience
    const members = [] as any[]
    for (const uid of team.memberUserIds) {
      const b = await findBlob(usersKey(uid))
      if (!b) continue
      const { data } = await readJson<any>(b.url)
      members.push({ userId: data.id, name: data.name, email: data.email, role: data.role })
    }
    members.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }))

    return json(res, 200, {
      teamId: team.id,
      teamName: team.name,
      standupCutoffTime: team.standupCutoffTime,
      members,
    })
  }

  // POST /api/manager/members (rewired to this file)
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

    // Return full refreshed member list
    const members = [] as any[]
    for (const uid of team.memberUserIds) {
      const b = await findBlob(usersKey(uid))
      if (!b) continue
      const { data } = await readJson<any>(b.url)
      members.push({ userId: data.id, name: data.name, email: data.email, role: data.role })
    }

    members.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }))

    return json(res, 200, {
      teamId: team.id,
      teamName: team.name,
      standupCutoffTime: team.standupCutoffTime,
      members,
    })
  }

  // DELETE /api/manager/members (rewired to this file)
  if (req.method === 'DELETE') {
    const body = RemoveBody.safeParse(req.body)
    if (!body.success) return json(res, 400, { error: 'Invalid request body' })

    team.memberUserIds = team.memberUserIds.filter((id) => id !== body.data.userId)
    await saveTeam(team)

    // Return full refreshed member list
    const members = [] as any[]
    for (const uid of team.memberUserIds) {
      const b = await findBlob(usersKey(uid))
      if (!b) continue
      const { data } = await readJson<any>(b.url)
      members.push({ userId: data.id, name: data.name, email: data.email, role: data.role })
    }

    members.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }))

    return json(res, 200, {
      teamId: team.id,
      teamName: team.name,
      standupCutoffTime: team.standupCutoffTime,
      members,
    })
  }

  return badMethod(req, res, ['GET', 'POST', 'PUT', 'DELETE'])
}
