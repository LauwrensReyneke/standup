import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { badMethod, json } from '../_lib/http.js'
import { readSession, makeSessionToken, sessionCookie } from '../_lib/auth.js'
import { ensureBootstrapTeamAndManager, getUserById, userTeamIds, getRoleForTeam, ensureTeamForViewer } from '../_lib/store.js'

const Body = z.object({ teamId: z.string().min(5) })

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return badMethod(req, res, ['POST'])

  await ensureBootstrapTeamAndManager()

  const viewer = await readSession(req)
  if (!viewer) return json(res, 401, { error: 'Unauthorized' })

  // Self-heal in case their active team is missing.
  await ensureTeamForViewer(viewer)

  const body = Body.safeParse(req.body)
  if (!body.success) return json(res, 400, { error: 'Invalid request body' })

  const user = await getUserById(viewer.id)
  if (!user) return json(res, 401, { error: 'Unauthorized' })

  const allowedTeamIds = new Set(userTeamIds(user))
  if (!allowedTeamIds.has(body.data.teamId)) return json(res, 403, { error: 'Not a member of that team' })

  user.activeTeamId = body.data.teamId
  user.teamId = body.data.teamId
  user.role = getRoleForTeam(user, body.data.teamId)

  const token = await makeSessionToken({
    id: user.id,
    email: user.email,
    name: user.name,
    role: getRoleForTeam(user, body.data.teamId),
    teamId: body.data.teamId,
    activeTeamId: body.data.teamId,
    memberships: (user.memberships || []).map((m) => ({ teamId: m.teamId, role: m.role })),
  })

  res.setHeader('set-cookie', sessionCookie(token))
  return json(res, 200, { ok: true, activeTeamId: body.data.teamId })
}

