import type { VercelRequest, VercelResponse } from '@vercel/node'
import dayjs from 'dayjs'
import { badMethod, json } from '../_lib/http.js'
import { readSession } from '../_lib/auth.js'
import { ensureBootstrapTeamAndManager, getOrCreateStandup, getTeam } from '../_lib/store.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return badMethod(req, res, ['GET'])

  await ensureBootstrapTeamAndManager()

  const viewer = readSession(req)
  if (!viewer) return json(res, 401, { error: 'Unauthorized' })

  const team = await getTeam(viewer.teamId)
  if (!team) return json(res, 404, { error: 'Team not found' })

  const date = dayjs().format('YYYY-MM-DD')
  const cutoffAt = dayjs(`${date}T${team.standupCutoffTime}:00`).toISOString()
  const editable = dayjs().isBefore(dayjs(cutoffAt))

  const { doc, etag } = await getOrCreateStandup(team, date)

  return json(res, 200, {
    date,
    cutoffAt,
    editable,
    etag,
    teamName: team.name,
    viewer: { userId: viewer.id, role: viewer.role },
    rows: doc.rows,
  })
}
