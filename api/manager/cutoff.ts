import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { badMethod, json } from '../_lib/http'
import { readSession } from '../_lib/auth'
import { getTeam, saveTeam } from '../_lib/store'

const Body = z.object({ standupCutoffTime: z.string().regex(/^\d{2}:\d{2}$/) })

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PUT') return badMethod(req, res, ['PUT'])

  const viewer = readSession(req)
  if (!viewer) return json(res, 401, { error: 'Unauthorized' })
  if (viewer.role !== 'manager') return json(res, 403, { error: 'Manager only' })

  const team = await getTeam(viewer.teamId)
  if (!team) return json(res, 404, { error: 'Team not found' })

  const body = Body.safeParse(req.body)
  if (!body.success) return json(res, 400, { error: 'Invalid request body' })

  team.standupCutoffTime = body.data.standupCutoffTime
  await saveTeam(team)

  return json(res, 200, {
    teamId: team.id,
    teamName: team.name,
    standupCutoffTime: team.standupCutoffTime,
    members: [],
  })
}

