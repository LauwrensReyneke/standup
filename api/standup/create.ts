import type { VercelRequest, VercelResponse } from '@vercel/node'
import dayjs from 'dayjs'
import { badMethod, json } from '../_lib/http.js'
import { readSession } from '../_lib/auth.js'
import { ensureBootstrapTeamAndManager, getOrCreateStandup, getTeam } from '../_lib/store.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return badMethod(req, res, ['POST'])

  await ensureBootstrapTeamAndManager()

  const viewer = readSession(req)
  if (!viewer) return json(res, 401, { error: 'Unauthorized' })

  const team = await getTeam(viewer.teamId)
  if (!team) return json(res, 404, { error: 'Team not found' })

  const date = dayjs().format('YYYY-MM-DD')
  const { doc } = await getOrCreateStandup(team, date)
  return json(res, 200, { ok: true, date: doc.date })
}
