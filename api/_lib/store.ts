import { list } from '@vercel/blob'
import { readJson, readJsonOrNull, putJson } from './blob.js'
import { nanoid } from 'nanoid'

export const PREFIX = 'standup/v1'

export type UserRole = 'manager' | 'member'

export type UserMembership = {
  teamId: string
  role: UserRole
  joinedAt: string
}

export type User = {
  id: string
  email: string
  name: string
  /**
   * Legacy field (single-team); kept for backward compatibility.
   * New code should use memberships + activeTeamId.
   */
  teamId?: string
  /**
   * Legacy field (global role); kept for backward compatibility.
   * New code should use memberships[].role.
   */
  role?: UserRole

  memberships?: UserMembership[]
  activeTeamId?: string

  createdAt: string
  updatedAt: string
}

export type Team = {
  id: string
  name: string
  standupCutoffTime: string // "HH:mm"
  memberUserIds: string[]
  createdByUserId?: string
  /** Shareable code for managers to subscribe to this team */
  teamCode?: string
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

function normalizeUser(raw: User): Required<Pick<User, 'memberships' | 'activeTeamId'>> & User {
  const ts = nowIso()
  const memberships = Array.isArray(raw.memberships) ? raw.memberships.filter((m) => m && m.teamId) : []

  // Legacy migration: if teamId exists but memberships are missing/empty.
  if (memberships.length === 0 && raw.teamId) {
    memberships.push({ teamId: raw.teamId, role: (raw.role as UserRole) || 'member', joinedAt: raw.createdAt || ts })
  }

  const activeTeamId = raw.activeTeamId || raw.teamId || memberships[0]?.teamId || ''

  return {
    ...raw,
    memberships,
    activeTeamId,
  }
}

export function calcStatus(y: string, t: string, b: string): StandupStatus {
  const filled = [y.trim(), t.trim(), b.trim()].filter(Boolean).length
  if (filled === 0) return 'missing'
  if (filled === 3) return 'prepared'
  return 'partial'
}

export function userTeamIds(user: User) {
  const u = normalizeUser(user)
  return u.memberships.map((m) => m.teamId)
}

export function getRoleForTeam(user: User, teamId: string): UserRole {
  const u = normalizeUser(user)
  return u.memberships.find((m) => m.teamId === teamId)?.role || (u.role as UserRole) || 'member'
}

export function isManagerForTeam(user: User, teamId: string) {
  return getRoleForTeam(user, teamId) === 'manager'
}

export function ensureActiveTeamId(user: User) {
  const u = normalizeUser(user)
  return u.activeTeamId
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

export async function ensureBootstrapTeamAndManager(opts?: { email?: string; name?: string }) {
  const bootstrapEmail = (process.env.BOOTSTRAP_MANAGER_EMAIL || '').trim().toLowerCase()
  const initialManagerEmail = (process.env.INITIAL_MANAGER_EMAIL || '').trim().toLowerCase()

  const email = (bootstrapEmail || initialManagerEmail || opts?.email || '').trim().toLowerCase()
  if (!email) return

  const name = process.env.BOOTSTRAP_MANAGER_NAME || opts?.name || 'Manager'
  const teamName = process.env.BOOTSTRAP_TEAM_NAME || 'Engineering'

  // If env enforces a specific manager email, require it to be allowlisted.
  // This prevents accidentally making an arbitrary email an admin.
  if (email === bootstrapEmail || email === initialManagerEmail) {
    // Lazy import to avoid circular deps; allowlist lives in a different module.
    const { isEmailAllowed } = await import('./allowlist.js')
    if (!isEmailAllowed(email)) return
  }

  const mappingKey = teamByEmailKey(email)
  let mappingBlob = await findBlob(mappingKey)

  // If the mapping is missing, the user might exist without the email mapping.
  // Try to find any existing user blob with a matching email.
  if (!mappingBlob) {
    const existingUsers = await list({ prefix: `${PREFIX}/users/`, limit: 200 })
    for (const b of existingUsers.blobs) {
      const { data: u } = await readJson<User>(b.url)
      if ((u.email || '').toLowerCase() === email) {
        await putJson(mappingKey, { userId: u.id })
        mappingBlob = await findBlob(mappingKey)
        break
      }
    }
  }

  // If user doesn't exist yet, create a new team + manager.
  if (!mappingBlob) {
    // Safety: if neither BOOTSTRAP_MANAGER_EMAIL nor INITIAL_MANAGER_EMAIL are set,
    // only allow creating the very first user when there are no users yet.
    if (!bootstrapEmail && !initialManagerEmail) {
      const anyUsers = await list({ prefix: `${PREFIX}/users/`, limit: 1 })
      if (anyUsers.blobs.length > 0) return
    }

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
      teamCode: nanoid(10),
    }

    const user: User = {
      id: managerId,
      email,
      name,
      role: 'manager',
      teamId,
      createdAt: ts,
      updatedAt: ts,
    }

    await putJson(teamKey(teamId), team)
    await putJson(usersKey(managerId), user)
    await putJson(mappingKey, { userId: managerId })
    return
  }

  // Mapping exists: if INITIAL_MANAGER_EMAIL (or BOOTSTRAP_MANAGER_EMAIL) matches,
  // ensure the user is promoted to manager.
  if (email === initialManagerEmail || email === bootstrapEmail) {
    const { data: mapping } = await readJson<{ userId: string }>(mappingBlob.url)
    const userBlob = await findBlob(usersKey(mapping.userId))
    if (!userBlob) return
    const { data: user } = await readJson<User>(userBlob.url)

    // Self-heal: user exists but their team blob is missing (common after blob resets).
    // Recreate the team and reattach this manager to it.
    const existingTeam = user.teamId ? await getTeam(user.teamId) : null
    if (!existingTeam) {
      const teamId = nanoid()
      const ts = nowIso()

      const team: Team = {
        id: teamId,
        name: teamName,
        standupCutoffTime: process.env.DEFAULT_STANDUP_CUTOFF || '09:30',
        memberUserIds: [user.id],
        createdAt: ts,
        updatedAt: ts,
        teamCode: nanoid(10),
      }

      const updatedUser: User = { ...user, teamId, role: 'manager', updatedAt: ts }

      await putJson(teamKey(teamId), team)
      await putJson(usersKey(updatedUser.id), updatedUser)
      await putJson(teamByEmailKey(updatedUser.email.toLowerCase()), { userId: updatedUser.id })
      return
    }

    if (user.role !== 'manager') {
      const updated: User = { ...user, role: 'manager' }
      await putJson(usersKey(updated.id), updated)
    }
  }
}

export async function findBlob(key: string) {
  const res = await list({ prefix: key, limit: 1 })
  return res.blobs.find((b) => b.pathname === key) || null
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const mapping = await findBlob(teamByEmailKey(email.toLowerCase()))
  if (!mapping) return null

  const mappingDoc = await readJsonOrNull<{ userId: string }>(mapping.url)
  if (!mappingDoc) return null

  const userBlob = await findBlob(usersKey(mappingDoc.data.userId))
  if (!userBlob) return null

  const userDoc = await readJsonOrNull<User>(userBlob.url)
  if (!userDoc) return null

  return normalizeUser(userDoc.data)
}

export async function getUserById(userId: string): Promise<User | null> {
  const userBlob = await findBlob(usersKey(userId))
  if (!userBlob) return null
  const userDoc = await readJsonOrNull<User>(userBlob.url)
  if (!userDoc) return null
  return normalizeUser(userDoc.data)
}

export async function upsertUser(user: User) {
  const u = normalizeUser(user)
  u.updatedAt = nowIso()
  // Keep legacy fields in sync for older code paths.
  u.teamId = u.activeTeamId
  u.role = getRoleForTeam(u, u.activeTeamId)

  await putJson(usersKey(u.id), u)
  await putJson(teamByEmailKey(u.email.toLowerCase()), { userId: u.id })
}

export async function updateUserProfile(userId: string, patch: { name?: string; email?: string }) {
  const existing = await getUserById(userId)
  if (!existing) return null

  const updated: User = {
    ...existing,
    name: typeof patch.name === 'string' ? patch.name : existing.name,
    email: typeof patch.email === 'string' ? patch.email.toLowerCase() : existing.email,
  }

  // If email changed, also update mapping key.
  if (updated.email !== existing.email) {
    await putJson(teamByEmailKey(updated.email.toLowerCase()), { userId: existing.id })
  }

  await upsertUser(updated)
  return normalizeUser(updated)
}

export async function getTeam(teamId: string): Promise<Team | null> {
  const blob = await findBlob(teamKey(teamId))
  if (!blob) return null
  const { data } = await readJson<Team>(blob.url)
  return data
}

export async function createTeam(opts: { name: string; standupCutoffTime?: string; createdByUserId: string }) {
  const ts = nowIso()
  const teamId = nanoid()
  const team: Team = {
    id: teamId,
    name: opts.name.trim(),
    standupCutoffTime: (opts.standupCutoffTime || process.env.DEFAULT_STANDUP_CUTOFF || '09:30').trim(),
    memberUserIds: [opts.createdByUserId],
    createdByUserId: opts.createdByUserId,
    teamCode: nanoid(10),
    createdAt: ts,
    updatedAt: ts,
  }
  await putJson(teamKey(teamId), team)
  return team
}

export async function getTeamByCode(teamCode: string): Promise<Team | null> {
  const code = (teamCode || '').trim()
  if (!code) return null

  // Brute-force scan; team count is expected to be small for this app.
  // If it grows, we can add an index blob (standup/v1/team-code/<code>.json).
  const listed = await list({ prefix: `${PREFIX}/teams/`, limit: 200 })
  for (const b of listed.blobs) {
    const { data: t } = await readJson<Team>(b.url)
    if ((t.teamCode || '').trim() === code) return t
  }
  return null
}

export async function addUserToTeam(opts: { teamId: string; userId: string; role: UserRole }) {
  const team = await getTeam(opts.teamId)
  if (!team) return null

  const user = await getUserById(opts.userId)
  if (!user) return null

  const ts = nowIso()
  const u = normalizeUser(user)
  if (!u.memberships.some((m) => m.teamId === opts.teamId)) {
    u.memberships.push({ teamId: opts.teamId, role: opts.role, joinedAt: ts })
  } else {
    u.memberships = u.memberships.map((m) => (m.teamId === opts.teamId ? { ...m, role: opts.role } : m))
  }

  // Default active team if missing.
  if (!u.activeTeamId) u.activeTeamId = opts.teamId

  // Update team membership list.
  if (!team.memberUserIds.includes(opts.userId)) team.memberUserIds.push(opts.userId)

  await upsertUser(u)
  await saveTeam(team)

  return { team, user: normalizeUser(u) }
}

export async function removeUserFromTeam(opts: { teamId: string; userId: string }) {
  const team = await getTeam(opts.teamId)
  if (!team) return null

  const user = await getUserById(opts.userId)
  if (!user) return null

  const u = normalizeUser(user)
  u.memberships = u.memberships.filter((m) => m.teamId !== opts.teamId)

  team.memberUserIds = team.memberUserIds.filter((id) => id !== opts.userId)

  // If active team removed, pick another.
  if (u.activeTeamId === opts.teamId) {
    u.activeTeamId = u.memberships[0]?.teamId || ''
  }

  await upsertUser(u)
  await saveTeam(team)

  return { team, user: normalizeUser(u) }
}

export async function setUserRoleForTeam(opts: { teamId: string; userId: string; role: UserRole }) {
  const user = await getUserById(opts.userId)
  if (!user) return null

  const u = normalizeUser(user)
  const ts = nowIso()
  if (!u.memberships.some((m) => m.teamId === opts.teamId)) {
    u.memberships.push({ teamId: opts.teamId, role: opts.role, joinedAt: ts })
  } else {
    u.memberships = u.memberships.map((m) => (m.teamId === opts.teamId ? { ...m, role: opts.role } : m))
  }
  await upsertUser(u)
  return normalizeUser(u)
}

export async function listTeamsForUser(userId: string): Promise<Team[]> {
  const user = await getUserById(userId)
  if (!user) return []
  const u = normalizeUser(user)

  const teams: Team[] = []
  for (const m of u.memberships) {
    const t = await getTeam(m.teamId)
    if (t) teams.push(t)
  }

  teams.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }))
  return teams
}

export async function saveTeam(team: Team) {
  team.updatedAt = nowIso()
  await putJson(teamKey(team.id), team)
}

/**
 * Self-heal guard: given a user (usually from session), ensure their team exists.
 * If the team is missing, create a new team and attach the user to it.
 */
export async function ensureTeamForUser(user: Pick<User, 'id' | 'email' | 'teamId'> & { name?: string }): Promise<Team | null> {
  const u = normalizeUser(user as User)
  const existing = u.activeTeamId ? await getTeam(u.activeTeamId) : null
  if (existing) return existing

  const ts = nowIso()
  const teamId = nanoid()

  const team: Team = {
    id: teamId,
    name: process.env.BOOTSTRAP_TEAM_NAME || 'Engineering',
    standupCutoffTime: process.env.DEFAULT_STANDUP_CUTOFF || '09:30',
    memberUserIds: [u.id],
    createdByUserId: u.id,
    createdAt: ts,
    updatedAt: ts,
    teamCode: nanoid(10),
  }

  await putJson(teamKey(teamId), team)

  // Update user record to point to the recreated team (best-effort).
  const uBlob = await findBlob(usersKey(u.id))
  if (uBlob) {
    const uDoc = await readJsonOrNull<User>(uBlob.url)
    if (uDoc) {
      const normalized = normalizeUser(uDoc.data)
      normalized.activeTeamId = teamId
      normalized.teamId = teamId
      if (!normalized.memberships.some((m) => m.teamId === teamId)) {
        normalized.memberships.push({ teamId, role: getRoleForTeam(normalized, teamId), joinedAt: ts })
      }
      await upsertUser(normalized)
    }
  }

  return team
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
    return { doc, etag: String(doc.version), url: created.url }
  }

  const { data } = await readJson<StandupDoc>(blob.url)

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

  return { doc: data, etag: String(data.version), url: blob.url }
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

  // ETag/If-Match is no longer enforced at the storage level.
  // We keep the API contract but use a soft check based on doc.version.
  const ifMatchVersion = Number(opts.ifMatch)
  if (Number.isFinite(ifMatchVersion) && ifMatchVersion !== doc.version) {
    const e: any = new Error('Conflict')
    e.status = 409
    throw e
  }

  doc.version += 1
  doc.updatedAt = nowIso()

  await putJson(standupKey(team.id, date), doc)
  return { doc, etag: String(doc.version) }
}

export async function ensureTeamForViewer(viewer: { id: string; teamId: string; role?: 'manager' | 'member'; activeTeamId?: string }) {
  if (!viewer?.id) return null

  // Prefer activeTeamId when present.
  const teamId = viewer.activeTeamId || viewer.teamId

  // If the team exists, nothing to do.
  const existing = teamId ? await getTeam(teamId) : null
  if (existing) return existing

  // Attempt to load the user record.
  const userBlob = await findBlob(usersKey(viewer.id))
  if (!userBlob) return null
  const { data: raw } = await readJson<User>(userBlob.url)
  const user = normalizeUser(raw)

  // If the user's team exists, nothing to do.
  const existingForUser = user.activeTeamId ? await getTeam(user.activeTeamId) : null
  if (existingForUser) return existingForUser

  // Repair: create a new team, attach this user.
  const repaired = await createTeam({
    name: process.env.BOOTSTRAP_TEAM_NAME || 'Engineering',
    standupCutoffTime: process.env.DEFAULT_STANDUP_CUTOFF || '09:30',
    createdByUserId: user.id,
  })

  // Attach user to repaired team.
  const role: UserRole = viewer.role === 'manager' ? 'manager' : getRoleForTeam(user, user.activeTeamId || user.teamId || '')
  const u = normalizeUser(user)
  u.activeTeamId = repaired.id
  u.teamId = repaired.id
  u.role = role
  u.memberships = [{ teamId: repaired.id, role, joinedAt: nowIso() }]

  await upsertUser(u)

  return repaired
}

