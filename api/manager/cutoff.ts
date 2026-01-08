import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { badMethod, json } from '../_lib/http.js'
import { readSession } from '../_lib/auth.js'
import { getTeam, saveTeam } from '../_lib/store.js'

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

  // Return full refreshed member list
  const { usersKey, findBlob } = await import('../_lib/store.js')
  const { readJson } = await import('../_lib/blob.js')
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
