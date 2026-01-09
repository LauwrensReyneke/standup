import type { VercelRequest, VercelResponse } from '@vercel/node'
import dayjs from 'dayjs'
import { z } from 'zod'
import { list } from '@vercel/blob'
import { badMethod, json } from './_lib/http.js'
import { readSession } from './_lib/auth.js'
import {
  PREFIX,
  ensureBootstrapTeamAndManager,
  ensureTeamForViewer,
  getOrCreateStandup,
  getTeam,
  standupKey,
  findBlob,
  updateStandupEntry,
} from './_lib/store.js'
import { readJson } from './_lib/blob.js'

const DayQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  create: z.union([z.literal('1'), z.literal('true')]).optional(),
})

const UpdateBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  userId: z.string().min(5),
  yesterday: z.string(),
  today: z.string(),
  blockers: z.string(),
})

function opFrom(req: VercelRequest): string {
  return String((req.query.op as any) || '').toLowerCase()
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureBootstrapTeamAndManager()

  const viewer = await readSession(req)
  if (!viewer) return json(res, 401, { error: 'Unauthorized' })

  const teamId = viewer.activeTeamId || viewer.teamId
  const team = (await getTeam(teamId)) || (await ensureTeamForViewer(viewer))
  if (!team) return json(res, 404, { error: 'Team not found' })

  const op = opFrom(req)

  // GET ?op=today
  if (req.method === 'GET' && op === 'today') {
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

  // GET ?op=day&date=YYYY-MM-DD[&create=true]
  if (req.method === 'GET' && op === 'day') {
    const parsed = DayQuery.safeParse(req.query)
    if (!parsed.success) return json(res, 400, { error: 'Invalid query' })

    const date = parsed.data.date
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

  // GET ?op=history&limit=14
  if (req.method === 'GET' && op === 'history') {
    const limit = Math.min(Number(req.query.limit || 14), 60)

    const prefix = `${PREFIX}/standups/${team.id}/`
    const listed = await list({ prefix, limit: 200 })

    const blobs = [...listed.blobs].sort((a, b) => (a.pathname < b.pathname ? 1 : -1)).slice(0, limit)

    const days = [] as Array<{ date: string; rows: Array<{ userId: string; name: string; status: any }> }>
    for (const b of blobs) {
      const { data } = await readJson<any>(b.url)
      const rows = (data.rows || []).map((r: any) => ({ userId: r.userId, name: r.name, status: r.status }))
      rows.sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }))
      days.push({ date: data.date, rows })
    }

    if (days.length === 0) {
      const date = dayjs().format('YYYY-MM-DD')
      days.push({ date, rows: [] })
    }

    return json(res, 200, { days })
  }

  // PUT ?op=update
  if (req.method === 'PUT' && op === 'update') {
    const body = UpdateBody.safeParse(req.body)
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

  // POST ?op=create (create today's doc)
  if (req.method === 'POST' && op === 'create') {
    const date = dayjs().format('YYYY-MM-DD')
    const { doc } = await getOrCreateStandup(team, date)
    return json(res, 200, { ok: true, date: doc.date })
  }

  return badMethod(req, res, ['GET', 'PUT', 'POST'])
}
