import type { VercelRequest, VercelResponse } from '@vercel/node'
import dayjs from 'dayjs'
import { z } from 'zod'
import { badMethod, json } from '../_lib/http.js'
import { readSession } from '../_lib/auth.js'
import { ensureBootstrapTeamAndManager, ensureTeamForViewer, getTeam, updateStandupEntry } from '../_lib/store.js'

const Body = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  userId: z.string().min(5),
  yesterday: z.string(),
  today: z.string(),
  blockers: z.string(),
})

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PUT') return badMethod(req, res, ['PUT'])

  await ensureBootstrapTeamAndManager()

  const viewer = await readSession(req)
  if (!viewer) return json(res, 401, { error: 'Unauthorized' })

  // viewer is a concrete SessionUser here.
  const teamId = viewer.activeTeamId || viewer.teamId
  const team = (await getTeam(teamId)) || (await ensureTeamForViewer(viewer))
  if (!team) return json(res, 404, { error: 'Team not found' })

  const body = Body.safeParse(req.body)
  if (!body.success) return json(res, 400, { error: 'Invalid request body' })

  const cutoffAt = dayjs(`${body.data.date}T${team.standupCutoffTime}:00`)
  if (dayjs().isAfter(cutoffAt)) return json(res, 403, { error: 'Standup locked after cutoff' })

  const ifMatch = String(req.headers['if-match'] || '')
  if (!ifMatch) return json(res, 428, { error: 'Missing If-Match header' })

  try {
    const { doc, etag } = await updateStandupEntry({
      team,
      date: body.data.date,
      viewerUserId: viewer.id,
      viewerRole: viewer.role,
      userId: body.data.userId,
      yesterday: body.data.yesterday,
      today: body.data.today,
      blockers: body.data.blockers,
      ifMatch,
    })

    return json(res, 200, {
      date: doc.date,
      cutoffAt: cutoffAt.toISOString(),
      editable: true,
      etag,
      teamName: team.name,
      viewer: { userId: viewer.id, role: viewer.role },
      rows: doc.rows,
    })
  } catch (e: any) {
    return json(res, e.status || 500, { error: e.message || 'Failed' })
  }
}
