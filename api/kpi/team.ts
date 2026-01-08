import type { VercelRequest, VercelResponse } from '@vercel/node'
import dayjs from 'dayjs'
import { list } from '@vercel/blob'
import { badMethod, json } from '../_lib/http.js'
import { readSession } from '../_lib/auth.js'
import { PREFIX, StandupDoc, StandupStatus, getTeam, usersKey, findBlob, ensureTeamForViewer } from '../_lib/store.js'
import { readJson } from '../_lib/blob.js'

function score(status: StandupStatus) {
  if (status === 'prepared') return 100
  if (status === 'partial') return 50
  return 0
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return badMethod(req, res, ['GET'])

  const viewer = await readSession(req)
  if (!viewer) return json(res, 401, { error: 'Unauthorized' })

  const team = (await getTeam(viewer.teamId)) || (await ensureTeamForViewer(viewer))
  if (!team) {
    console.log('[team-not-found]', { viewerId: viewer.id, teamId: viewer.teamId })
    return json(res, 404, { error: 'Team not found', teamId: viewer.teamId })
  }

  const prefix = `${PREFIX}/standups/${team.id}/`
  const listed = await list({ prefix, limit: 200 })

  const cutoffDate = dayjs().subtract(30, 'day')
  const docs: StandupDoc[] = []

  for (const b of listed.blobs) {
    const dateStr = b.pathname.slice(prefix.length).replace('.json', '')
    if (dayjs(dateStr).isBefore(cutoffDate)) continue
    const { data } = await readJson<StandupDoc>(b.url)
    docs.push(data)
  }

  const users = [] as any[]
  for (const uid of team.memberUserIds) {
    const ub = await findBlob(usersKey(uid))
    if (!ub) continue
    const { data: u } = await readJson<any>(ub.url)

    const last7 = [] as StandupStatus[]
    let prepared = 0,
      partial = 0,
      missing = 0

    const byDate = docs
      .filter((d) => d.rows.some((r) => r.userId === uid))
      .sort((a, b) => (a.date < b.date ? 1 : -1))

    for (const d of byDate) {
      const row = d.rows.find((r) => r.userId === uid)
      if (!row) continue
      if (row.status === 'prepared') prepared++
      else if (row.status === 'partial') partial++
      else missing++

      if (last7.length < 7) last7.push(row.status)
    }

    const weeklyAveragePercent = last7.length ? last7.reduce((acc, s) => acc + score(s), 0) / last7.length : 0

    // Missing streak = consecutive missing from most recent backwards
    let missingStreak = 0
    for (const d of byDate) {
      const row = d.rows.find((r) => r.userId === uid)
      if (!row) continue
      if (row.status === 'missing') missingStreak++
      else break
    }

    users.push({ userId: uid, name: u.name, prepared, partial, missing, weeklyAveragePercent, missingStreak })
  }

  users.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }))

  const teamCompliancePercent = users.length
    ? users.reduce((acc, u) => acc + u.weeklyAveragePercent, 0) / users.length
    : 0

  return json(res, 200, { teamName: team.name, teamCompliancePercent, users })
}
