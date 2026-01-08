import type { VercelRequest, VercelResponse } from '@vercel/node'
import dayjs from 'dayjs'
import { badMethod, json } from '../_lib/http.js'
import { readSession } from '../_lib/auth.js'
import { ensureBootstrapTeamAndManager, ensureTeamForViewer, getOrCreateStandup, getTeam } from '../_lib/store.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return badMethod(req, res, ['GET'])

  await ensureBootstrapTeamAndManager()

  const viewer = await readSession(req)
  if (!viewer) return json(res, 401, { error: 'Unauthorized' })

  const team = (await getTeam(viewer.teamId)) || (await ensureTeamForViewer(viewer))
  if (!team) {
    console.log('[team-not-found]', { viewerId: viewer.id, teamId: viewer.teamId })
    return json(res, 404, { error: 'Team not found', teamId: viewer.teamId })
  }

  const date = dayjs().format('YYYY-MM-DD')
  const cutoffAt = dayjs(`${date}T${team.standupCutoffTime}:00`).toISOString()
  const editable = dayjs().isBefore(dayjs(cutoffAt))

  const { doc, etag } = await getOrCreateStandup(team, date)

  const rows = [...doc.rows].sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }))

  return json(res, 200, {
    date,
    cutoffAt,
    editable,
    etag,
    teamName: team.name,
    viewer: { userId: viewer.id, role: viewer.role },
    rows,
  })
}
