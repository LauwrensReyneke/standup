import { list, put } from '@vercel/blob'
import { readJson, putJson } from './blob.js'
import { nanoid } from 'nanoid'

export const PREFIX = 'standup/v1'

export type User = {
  id: string
  email: string
  name: string
  role: 'manager' | 'member'
  teamId: string
  createdAt: string
  updatedAt: string
}

export type Team = {
  id: string
  name: string
  standupCutoffTime: string // "HH:mm"
  memberUserIds: string[]
  createdAt: string
  updatedAt: string
}

export type StandupStatus = 'prepared' | 'partial' | 'missing'

export type StandupRow = {
  userId: string
  name: string
  yesterday: string
  today: string
  blockers: string
  status: StandupStatus
  overriddenBy?: string
}

export type StandupDoc = {
  teamId: string
  date: string // YYYY-MM-DD
  version: number
  updatedAt: string
  rows: StandupRow[]
  overrides: Array<{ at: string; byUserId: string; userId: string; status: StandupStatus; reason?: string }>
}

function nowIso() {
  return new Date().toISOString()
}

export function calcStatus(y: string, t: string, b: string): StandupStatus {
  const filled = [y.trim(), t.trim(), b.trim()].filter(Boolean).length
  if (filled === 0) return 'missing'
  if (filled === 3) return 'prepared'
  return 'partial'
}

export function usersKey(userId: string) {
  return `${PREFIX}/users/${userId}.json`
}

export function teamKey(teamId: string) {
  return `${PREFIX}/teams/${teamId}.json`
}

export function teamByEmailKey(email: string) {
  return `${PREFIX}/email/${encodeURIComponent(email.toLowerCase())}.json`
}

export function standupKey(teamId: string, date: string) {
  return `${PREFIX}/standups/${teamId}/${date}.json`
}

export async function ensureBootstrapTeamAndManager() {
  const email = process.env.BOOTSTRAP_MANAGER_EMAIL
  const name = process.env.BOOTSTRAP_MANAGER_NAME || 'Manager'
  const teamName = process.env.BOOTSTRAP_TEAM_NAME || 'Engineering'

  if (!email) return

  const lower = email.toLowerCase()
  const mappingKey = teamByEmailKey(lower)

  // If mapping exists, we assume bootstrap is done.
  const existing = await findBlob(mappingKey)
  if (existing) return

  const teamId = nanoid()
  const managerId = nanoid()
  const ts = nowIso()

  const team: Team = {
    id: teamId,
    name: teamName,
    standupCutoffTime: process.env.DEFAULT_STANDUP_CUTOFF || '09:30',
    memberUserIds: [managerId],
    createdAt: ts,
    updatedAt: ts,
  }

  const user: User = {
    id: managerId,
    email: lower,
    name,
    role: 'manager',
    teamId,
    createdAt: ts,
    updatedAt: ts,
  }

  await put(teamKey(teamId), JSON.stringify(team, null, 2), { access: 'private', addRandomSuffix: false })
  await put(usersKey(managerId), JSON.stringify(user, null, 2), { access: 'private', addRandomSuffix: false })
  await put(mappingKey, JSON.stringify({ userId: managerId }, null, 2), { access: 'private', addRandomSuffix: false })
}

export async function findBlob(key: string) {
  const res = await list({ prefix: key, limit: 1 })
  return res.blobs.find((b) => b.pathname === key) || null
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const mapping = await findBlob(teamByEmailKey(email.toLowerCase()))
  if (!mapping) return null
  const { data } = await readJson<{ userId: string }>(mapping.url)
  const userBlob = await findBlob(usersKey(data.userId))
  if (!userBlob) return null
  const user = await readJson<User>(userBlob.url)
  return user.data
}

export async function upsertUser(user: User) {
  user.updatedAt = nowIso()
  await putJson(usersKey(user.id), user)
  await putJson(teamByEmailKey(user.email.toLowerCase()), { userId: user.id })
}

export async function getTeam(teamId: string): Promise<Team | null> {
  const blob = await findBlob(teamKey(teamId))
  if (!blob) return null
  const { data } = await readJson<Team>(blob.url)
  return data
}

export async function saveTeam(team: Team) {
  team.updatedAt = nowIso()
  await putJson(teamKey(team.id), team)
}

export async function getOrCreateStandup(team: Team, date: string): Promise<{ doc: StandupDoc; etag: string } & { url: string }> {
  const key = standupKey(team.id, date)
  const blob = await findBlob(key)
  if (!blob) {
    const doc: StandupDoc = {
      teamId: team.id,
      date,
      version: 0,
      updatedAt: nowIso(),
      rows: [],
      overrides: [],
    }

    // Initialize rows for team members (locked names)
    for (const uid of team.memberUserIds) {
      const uBlob = await findBlob(usersKey(uid))
      if (!uBlob) continue
      const { data: u } = await readJson<User>(uBlob.url)
      doc.rows.push({
        userId: u.id,
        name: u.name,
        yesterday: '',
        today: '',
        blockers: '',
        status: 'missing',
      })
    }

    const created = await putJson(key, doc)
    const etag = created.etag || ''
    return { doc, etag, url: created.url }
  }

  const { data, etag } = await readJson<StandupDoc>(blob.url)

  // Ensure member list is carried over (manager may have changed team membership)
  const current = new Map(data.rows.map((r) => [r.userId, r]))
  const rows: StandupRow[] = []
  for (const uid of team.memberUserIds) {
    const existingRow = current.get(uid)
    if (existingRow) {
      rows.push(existingRow)
      continue
    }
    const uBlob = await findBlob(usersKey(uid))
    if (!uBlob) continue
    const { data: u } = await readJson<User>(uBlob.url)
    rows.push({ userId: u.id, name: u.name, yesterday: '', today: '', blockers: '', status: 'missing' })
  }
  data.rows = rows

  return { doc: data, etag, url: blob.url }
}

export async function updateStandupEntry(opts: {
  team: Team
  date: string
  viewerUserId: string
  viewerRole: 'manager' | 'member'
  userId: string
  yesterday: string
  today: string
  blockers: string
  ifMatch: string
}): Promise<{ doc: StandupDoc; etag: string }> {
  const { team, date, viewerUserId, viewerRole, userId } = opts

  if (viewerRole !== 'manager' && viewerUserId !== userId) {
    const e: any = new Error('Forbidden')
    e.status = 403
    throw e
  }

  const { doc } = await getOrCreateStandup(team, date)
  const idx = doc.rows.findIndex((r) => r.userId === userId)
  if (idx < 0) {
    const e: any = new Error('User not on team')
    e.status = 400
    throw e
  }

  doc.rows[idx] = {
    ...doc.rows[idx],
    yesterday: opts.yesterday,
    today: opts.today,
    blockers: opts.blockers,
    status: calcStatus(opts.yesterday, opts.today, opts.blockers),
  }
  doc.version += 1
  doc.updatedAt = nowIso()

  try {
    const putRes = await putJson(standupKey(team.id, date), doc, { ifMatch: opts.ifMatch })
    return { doc, etag: putRes.etag || '' }
  } catch (err: any) {
    // If-Match failed => conflict
    const e: any = new Error('Conflict')
    e.status = 409
    throw e
  }
}
