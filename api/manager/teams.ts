import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { badMethod, json } from '../_lib/http.js'
import { readSession, makeSessionToken, sessionCookie } from '../_lib/auth.js'
import {
  ensureBootstrapTeamAndManager,
  createTeam,
  listTeamsForUser,
  addUserToTeam,
  getUserById,
  getRoleForTeam,
} from '../_lib/store.js'

const CreateTeamBody = z.object({ name: z.string().min(1).max(80), standupCutoffTime: z.string().regex(/^\d{2}:\d{2}$/).optional() })

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await ensureBootstrapTeamAndManager()

  const viewer = await readSession(req)
  if (!viewer) return json(res, 401, { error: 'Unauthorized' })
  if (viewer.role !== 'manager') return json(res, 403, { error: 'Manager only' })

  // GET /api/manager/teams
  if (req.method === 'GET') {
    const teams = await listTeamsForUser(viewer.id)

    const user = await getUserById(viewer.id)
    const activeTeamId = user?.activeTeamId || viewer.activeTeamId || viewer.teamId

    return json(res, 200, {
      activeTeamId,
      teams: teams.map((t) => ({
        id: t.id,
        name: t.name,
        standupCutoffTime: t.standupCutoffTime,
        memberCount: t.memberUserIds.length,
        teamCode: t.teamCode || null,
      })),
    })
  }

  // POST /api/manager/teams
  if (req.method === 'POST') {
    const body = CreateTeamBody.safeParse(req.body)
    if (!body.success) return json(res, 400, { error: 'Invalid request body' })

    const team = await createTeam({
      name: body.data.name,
      standupCutoffTime: body.data.standupCutoffTime,
      createdByUserId: viewer.id,
    })

    // Ensure creator is a manager on the new team.
    await addUserToTeam({ teamId: team.id, userId: viewer.id, role: 'manager' })

    // Update session active team.
    const user = await getUserById(viewer.id)
    if (user) {
      user.activeTeamId = team.id
      // keep legacy fields synced
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
      teams: teams.map((t) => ({
        id: t.id,
        name: t.name,
        standupCutoffTime: t.standupCutoffTime,
        memberCount: t.memberUserIds.length,
        teamCode: t.teamCode || null,
      })),
    })
  }

  return badMethod(req, res, ['GET', 'POST'])
}
