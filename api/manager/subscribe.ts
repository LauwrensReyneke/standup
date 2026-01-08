import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { badMethod, json } from '../_lib/http.js'
import { readSession, makeSessionToken, sessionCookie } from '../_lib/auth.js'
import { ensureBootstrapTeamAndManager, getTeamByCode, addUserToTeam, getUserById, getRoleForTeam, listTeamsForUser } from '../_lib/store.js'

const Body = z.object({ teamCode: z.string().min(4) })

/**
 * Manager-created only: subscribe a (manager) user to an existing team using the team's shared code.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return badMethod(req, res, ['POST'])

  await ensureBootstrapTeamAndManager()

  const viewer = await readSession(req)
  if (!viewer) return json(res, 401, { error: 'Unauthorized' })
  if (viewer.role !== 'manager') return json(res, 403, { error: 'Manager only' })

  const body = Body.safeParse(req.body)
  if (!body.success) return json(res, 400, { error: 'Invalid request body' })

  const team = await getTeamByCode(body.data.teamCode)
  if (!team) return json(res, 404, { error: 'Team not found' })

  // Subscribe this manager as a manager to that team.
  await addUserToTeam({ teamId: team.id, userId: viewer.id, role: 'manager' })

  // Set active team to the newly subscribed one.
  const user = await getUserById(viewer.id)
  if (user) {
    user.activeTeamId = team.id
    user.teamId = team.id
    user.role = getRoleForTeam(user, team.id)
  }

  const token = user
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

  if (token) res.setHeader('set-cookie', sessionCookie(token))

  const teams = await listTeamsForUser(viewer.id)
  return json(res, 200, {
    activeTeamId: team.id,
    teams: teams.map((t) => ({ id: t.id, name: t.name, standupCutoffTime: t.standupCutoffTime, memberCount: t.memberUserIds.length, teamCode: t.teamCode || null })),
  })
}

