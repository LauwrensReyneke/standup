import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { badMethod, json } from './_lib/http.js'
import { readSession, makeSessionToken, sessionCookie } from './_lib/auth.js'
import {
  ensureBootstrapTeamAndManager,
  ensureTeamForViewer,
  getTeam,
  saveTeam,
  listTeamsForUser,
  createTeam,
  addUserToTeam,
  removeUserFromTeam,
  setUserRoleForTeam,
  getRoleForTeam,
  getTeamByCode,
  usersKey,
  findBlob,
  getUserByEmail,
  upsertUser,
  updateUserProfile,
  getUserById,
  userTeamIds,
} from './_lib/store.js'
import { readJson } from './_lib/blob.js'

function opFrom(req: VercelRequest): string {
  return String((req.query.op as any) || '').toLowerCase()
}

const CreateTeamBody = z.object({ name: z.string().min(1).max(80), standupCutoffTime: z.string().regex(/^\d{2}:\d{2}$/).optional() })
const SubscribeBody = z.object({ teamCode: z.string().min(4) })
const UpdateTeamNameBody = z.object({ teamName: z.string().min(1).max(80) })
const CutoffBody = z.object({ standupCutoffTime: z.string().regex(/^\d{2}:\d{2}$/) })

const AddMemberBody = z.object({ email: z.string().email(), name: z.string().min(1), role: z.enum(['manager', 'member']).optional() })
const RemoveMemberBody = z.object({ userId: z.string().min(5) })
const RoleBody = z.object({ userId: z.string().min(5), role: z.enum(['manager', 'member']) })
const PatchUserBody = z.object({ userId: z.string().min(5), name: z.string().min(1).optional(), email: z.string().email().optional() })

async function fetchMembers(teamId: string, team: { memberUserIds: string[] }) {
  const members = [] as any[]
  for (const uid of team.memberUserIds) {
    const b = await findBlob(usersKey(uid))
    if (!b) continue
    const { data } = await readJson<any>(b.url)
    members.push({ userId: data.id, name: data.name, email: data.email, role: getRoleForTeam(data, teamId) })
  }
  members.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }))
  return members
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureBootstrapTeamAndManager()

  const viewer = await readSession(req)
  if (!viewer) return json(res, 401, { error: 'Unauthorized' })
  if (viewer.role !== 'manager') return json(res, 403, { error: 'Manager only' })

  await ensureTeamForViewer(viewer)

  const op = opFrom(req)

  // --- Teams list/create/subscribe ---
  if (op === 'teams') {
    if (req.method === 'GET') {
      const teams = await listTeamsForUser(viewer.id)
      const user = await getUserById(viewer.id)
      const activeTeamId = user?.activeTeamId || viewer.activeTeamId || viewer.teamId
      return json(res, 200, {
        activeTeamId,
        teams: teams.map((t) => ({ id: t.id, name: t.name, standupCutoffTime: t.standupCutoffTime, memberCount: t.memberUserIds.length, teamCode: t.teamCode || null })),
      })
    }

    if (req.method === 'POST') {
      // Subscribe by code
      const subscribe = SubscribeBody.safeParse(req.body)
      if (subscribe.success) {
        const team = await getTeamByCode(subscribe.data.teamCode)
        if (!team) return json(res, 404, { error: 'Team not found' })

        await addUserToTeam({ teamId: team.id, userId: viewer.id, role: 'manager' })

        const user = await getUserById(viewer.id)
        if (user) {
          user.activeTeamId = team.id
          user.teamId = team.id
          user.role = getRoleForTeam(user, team.id)
        }

        const fresh = user
          ? await makeSessionToken({
              id: user.id,
              email: user.email,
              name: user.name,
              role: getRoleForTeam(user, team.id),
              teamId: team.id,
              activeTeamId: team.id,
              memberships: (user.memberships || []).map((m) => ({ teamId: m.teamId, role: m.role })),
            })
          : null
        if (fresh) res.setHeader('set-cookie', sessionCookie(fresh))

        const teams = await listTeamsForUser(viewer.id)
        return json(res, 200, {
          activeTeamId: team.id,
          teams: teams.map((t) => ({ id: t.id, name: t.name, standupCutoffTime: t.standupCutoffTime, memberCount: t.memberUserIds.length, teamCode: t.teamCode || null })),
        })
      }

      // Create team
      const body = CreateTeamBody.safeParse(req.body)
      if (!body.success) return json(res, 400, { error: 'Invalid request body' })

      const team = await createTeam({ name: body.data.name, standupCutoffTime: body.data.standupCutoffTime, createdByUserId: viewer.id })
      await addUserToTeam({ teamId: team.id, userId: viewer.id, role: 'manager' })

      const user = await getUserById(viewer.id)
      if (user) {
        user.activeTeamId = team.id
        user.teamId = team.id
        user.role = getRoleForTeam(user, team.id)
      }

      const fresh = user
        ? await makeSessionToken({
            id: user.id,
            email: user.email,
            name: user.name,
            role: getRoleForTeam(user, team.id),
            teamId: team.id,
            activeTeamId: team.id,
            memberships: (user.memberships || []).map((m) => ({ teamId: m.teamId, role: m.role })),
          })
        : null
      if (fresh) res.setHeader('set-cookie', sessionCookie(fresh))

      const teams = await listTeamsForUser(viewer.id)
      return json(res, 200, {
        activeTeamId: team.id,
        teams: teams.map((t) => ({ id: t.id, name: t.name, standupCutoffTime: t.standupCutoffTime, memberCount: t.memberUserIds.length, teamCode: t.teamCode || null })),
      })
    }

    return badMethod(req, res, ['GET', 'POST'])
  }

  // Active team context for remaining ops
  const activeTeamId = viewer.activeTeamId || viewer.teamId
  const team = await getTeam(activeTeamId)
  if (!team) return json(res, 404, { error: 'Team not found' })

  // --- Team settings ---
  if (op === 'team') {
    if (req.method === 'GET') {
      const members = await fetchMembers(activeTeamId, team)
      return json(res, 200, { teamId: team.id, teamName: team.name, standupCutoffTime: team.standupCutoffTime, members })
    }

    if (req.method === 'PUT') {
      const nameBody = UpdateTeamNameBody.safeParse(req.body)
      if (nameBody.success) {
        team.name = nameBody.data.teamName.trim()
        await saveTeam(team)
        const members = await fetchMembers(activeTeamId, team)
        return json(res, 200, { teamId: team.id, teamName: team.name, standupCutoffTime: team.standupCutoffTime, members })
      }

      const cutoffBody = CutoffBody.safeParse(req.body)
      if (cutoffBody.success) {
        team.standupCutoffTime = cutoffBody.data.standupCutoffTime
        await saveTeam(team)
        const members = await fetchMembers(activeTeamId, team)
        return json(res, 200, { teamId: team.id, teamName: team.name, standupCutoffTime: team.standupCutoffTime, members })
      }

      return json(res, 400, { error: 'Invalid request body' })
    }

    return badMethod(req, res, ['GET', 'PUT'])
  }

  // --- Members CRUD within active team ---
  if (op === 'members') {
    if (req.method === 'GET') {
      const members = await fetchMembers(activeTeamId, team)
      return json(res, 200, { teamId: team.id, teamName: team.name, standupCutoffTime: team.standupCutoffTime, members })
    }

    if (req.method === 'POST') {
      const body = AddMemberBody.safeParse(req.body)
      if (!body.success) return json(res, 400, { error: 'Invalid request body' })

      const email = body.data.email.toLowerCase()
      const existing = await getUserByEmail(email)
      const now = new Date().toISOString()
      const user = existing
        ? { ...existing, name: body.data.name }
        : { id: nanoid(), email, name: body.data.name, role: 'member' as const, teamId: activeTeamId, createdAt: now, updatedAt: now }

      await upsertUser(user)
      await addUserToTeam({ teamId: activeTeamId, userId: user.id, role: body.data.role || 'member' })

      const refreshed = await getTeam(activeTeamId)
      const members = refreshed ? await fetchMembers(activeTeamId, refreshed) : []
      return json(res, 200, { teamId: team.id, teamName: team.name, standupCutoffTime: team.standupCutoffTime, members })
    }

    if (req.method === 'PUT') {
      const body = RoleBody.safeParse(req.body)
      if (!body.success) return json(res, 400, { error: 'Invalid request body' })

      if (body.data.userId === viewer.id && body.data.role !== 'manager') {
        return json(res, 400, { error: "You can't remove your own manager access" })
      }

      const updated = await setUserRoleForTeam({ teamId: activeTeamId, userId: body.data.userId, role: body.data.role })
      if (!updated) return json(res, 404, { error: 'User not found' })

      if ((updated.activeTeamId || updated.teamId) === activeTeamId) {
        updated.teamId = activeTeamId
        updated.role = getRoleForTeam(updated, activeTeamId)
        await upsertUser(updated)
      }

      const refreshed = await getTeam(activeTeamId)
      const members = refreshed ? await fetchMembers(activeTeamId, refreshed) : []
      return json(res, 200, { teamId: team.id, teamName: team.name, standupCutoffTime: team.standupCutoffTime, members })
    }

    if (req.method === 'DELETE') {
      const body = RemoveMemberBody.safeParse(req.body)
      if (!body.success) return json(res, 400, { error: 'Invalid request body' })

      if (body.data.userId === viewer.id) {
        return json(res, 400, { error: "You can't remove yourself from the active team" })
      }

      await removeUserFromTeam({ teamId: activeTeamId, userId: body.data.userId })

      const refreshed = await getTeam(activeTeamId)
      const members = refreshed ? await fetchMembers(activeTeamId, refreshed) : []
      return json(res, 200, { teamId: team.id, teamName: team.name, standupCutoffTime: team.standupCutoffTime, members })
    }

    return badMethod(req, res, ['GET', 'POST', 'PUT', 'DELETE'])
  }

  // --- User profile patch (cross-team auth) ---
  if (op === 'user' && req.method === 'PATCH') {
    const body = PatchUserBody.safeParse(req.body)
    if (!body.success) return json(res, 400, { error: 'Invalid request body' })

    const viewerUser = await getUserById(viewer.id)
    if (!viewerUser) return json(res, 401, { error: 'Unauthorized' })

    const target = await getUserById(body.data.userId)
    if (!target) return json(res, 404, { error: 'User not found' })

    const sharedTeams = userTeamIds(viewerUser).filter((tid) => userTeamIds(target).includes(tid))
    const canManage = sharedTeams.some((tid) => getRoleForTeam(viewerUser, tid) === 'manager')
    if (!canManage) return json(res, 403, { error: 'Forbidden' })

    const updated = await updateUserProfile(body.data.userId, { name: body.data.name, email: body.data.email })
    if (!updated) return json(res, 404, { error: 'User not found' })

    const refreshed = await getTeam(activeTeamId)
    const members = refreshed ? await fetchMembers(activeTeamId, refreshed) : []
    return json(res, 200, { teamId: team.id, teamName: team.name, standupCutoffTime: team.standupCutoffTime, members })
  }

  return json(res, 400, { error: 'Invalid op' })
}

