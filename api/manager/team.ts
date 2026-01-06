import type { VercelRequest, VercelResponse } from '@vercel/node'
import { badMethod, json } from '../_lib/http'
import { readSession } from '../_lib/auth'
import { getTeam, usersKey, findBlob } from '../_lib/store'
import { readJson } from '../_lib/blob'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return badMethod(req, res, ['GET'])

  const viewer = readSession(req)
  if (!viewer) return json(res, 401, { error: 'Unauthorized' })
  if (viewer.role !== 'manager') return json(res, 403, { error: 'Manager only' })

  const team = await getTeam(viewer.teamId)
  if (!team) return json(res, 404, { error: 'Team not found' })

  const members = [] as any[]
  for (const uid of team.memberUserIds) {
    const b = await findBlob(usersKey(uid))
    if (!b) continue
    const { data } = await readJson<any>(b.url)
    members.push({ userId: data.id, name: data.name, email: data.email, role: data.role })
  }

  return json(res, 200, {
    teamId: team.id,
    teamName: team.name,
    standupCutoffTime: team.standupCutoffTime,
    members,
  })
}

