import type { VercelRequest, VercelResponse } from '@vercel/node'
import dayjs from 'dayjs'
import { list } from '@vercel/blob'
import { badMethod, json } from '../_lib/http.js'
import { readSession } from '../_lib/auth.js'
import { PREFIX, ensureTeamForViewer, getTeam } from '../_lib/store.js'
import { readJson } from '../_lib/blob.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return badMethod(req, res, ['GET'])

  const viewer = await readSession(req)
  if (!viewer) return json(res, 401, { error: 'Unauthorized' })

  const team = (await getTeam(viewer.teamId)) || (await ensureTeamForViewer(viewer))
  if (!team) return json(res, 404, { error: 'Team not found' })

  const limit = Math.min(Number(req.query.limit || 14), 60)

  const prefix = `${PREFIX}/standups/${team.id}/`
  const listed = await list({ prefix, limit: 200 })

  // Sort newest first by pathname date
  const blobs = [...listed.blobs].sort((a, b) => (a.pathname < b.pathname ? 1 : -1)).slice(0, limit)

  const days = [] as Array<{ date: string; rows: Array<{ userId: string; name: string; status: any }> }>
  for (const b of blobs) {
    const { data } = await readJson<any>(b.url)
    const rows = (data.rows || []).map((r: any) => ({ userId: r.userId, name: r.name, status: r.status }))
    rows.sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }))

    days.push({
      date: data.date,
      rows,
    })
  }

  // If there's no history yet, include today as an empty shell so UI isn't blank.
  if (days.length === 0) {
    const date = dayjs().format('YYYY-MM-DD')
    days.push({ date, rows: [] })
  }

  return json(res, 200, { days })
}
