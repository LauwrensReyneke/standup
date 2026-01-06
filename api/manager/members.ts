import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { badMethod, json } from '../_lib/http'
import { readSession } from '../_lib/auth'
import { ensureBootstrapTeamAndManager, getTeam, saveTeam, getUserByEmail, upsertUser } from '../_lib/store'
import { nanoid } from 'nanoid'

const AddBody = z.object({ email: z.string().email(), name: z.string().min(1) })
const RemoveBody = z.object({ userId: z.string().min(5) })

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureBootstrapTeamAndManager()

  const viewer = readSession(req)
  if (!viewer) return json(res, 401, { error: 'Unauthorized' })
  if (viewer.role !== 'manager') return json(res, 403, { error: 'Manager only' })

  const team = await getTeam(viewer.teamId)
  if (!team) return json(res, 404, { error: 'Team not found' })

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

    return json(res, 200, { teamId: team.id, teamName: team.name, standupCutoffTime: team.standupCutoffTime, members: [] })
  }

  if (req.method === 'DELETE') {
    const body = RemoveBody.safeParse(req.body)
    if (!body.success) return json(res, 400, { error: 'Invalid request body' })

    team.memberUserIds = team.memberUserIds.filter((id) => id !== body.data.userId)
    await saveTeam(team)
    return json(res, 200, { teamId: team.id, teamName: team.name, standupCutoffTime: team.standupCutoffTime, members: [] })
  }

  return badMethod(req, res, ['POST', 'DELETE'])
}

