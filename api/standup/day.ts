import type { VercelRequest, VercelResponse } from '@vercel/node'
import dayjs from 'dayjs'
import { z } from 'zod'
import { badMethod, json } from '../_lib/http.js'
import { readSession } from '../_lib/auth.js'
import { ensureBootstrapTeamAndManager, ensureTeamForViewer, findBlob, getOrCreateStandup, getTeam, standupKey } from '../_lib/store.js'
import { readJson } from '../_lib/blob.js'

const Query = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // Optional: if true, missing day will be created (same behavior as /today)
  create: z.union([z.literal('1'), z.literal('true')]).optional(),
})

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return badMethod(req, res, ['GET'])

  await ensureBootstrapTeamAndManager()

  const viewer = await readSession(req)
  if (!viewer) return json(res, 401, { error: 'Unauthorized' })

  const teamId = viewer.activeTeamId || viewer.teamId
  const team = (await getTeam(teamId)) || (await ensureTeamForViewer(viewer))
  if (!team) {
    console.log('[team-not-found]', { viewerId: viewer.id, teamId })
    return json(res, 404, { error: 'Team not found', teamId })
  }

  const parsed = Query.safeParse(req.query)
  if (!parsed.success) return json(res, 400, { error: 'Invalid query' })

  const date = parsed.data.date

  // Read-only view: never editable from this endpoint.
  const cutoffAt = dayjs(`${date}T${team.standupCutoffTime}:00`).toISOString()

  const key = standupKey(team.id, date)

  if (parsed.data.create) {
    const { doc, etag } = await getOrCreateStandup(team, date)
    const rows = [...doc.rows].sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }))
    return json(res, 200, {
      date: doc.date,
      cutoffAt,
      editable: false,
      etag,
      teamName: team.name,
      viewer: { userId: viewer.id, role: viewer.role },
      rows,
    })
  }

  const blob = await findBlob(key)
  if (!blob) return json(res, 404, { error: 'Standup not found' })

  const { data: doc } = await readJson<any>(blob.url)
  const rows = [...(doc.rows || [])].sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }))

  return json(res, 200, {
    date: doc.date,
    cutoffAt,
    editable: false,
    etag: String(doc.version ?? 0),
    teamName: team.name,
    viewer: { userId: viewer.id, role: viewer.role },
    rows,
  })
}
