import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { badMethod, json } from '../_lib/http.js'
import { readSession } from '../_lib/auth.js'
import {
  ensureBootstrapTeamAndManager,
  getUserById,
  updateUserProfile,
  userTeamIds,
  getRoleForTeam,
  ensureTeamForViewer,
} from '../_lib/store.js'

const PatchBody = z.object({ userId: z.string().min(5), name: z.string().min(1).optional(), email: z.string().email().optional() })

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'PATCH') return badMethod(req, res, ['PATCH'])

  await ensureBootstrapTeamAndManager()

  const viewer = await readSession(req)
  if (!viewer) return json(res, 401, { error: 'Unauthorized' })
  if (viewer.role !== 'manager') return json(res, 403, { error: 'Manager only' })

  await ensureTeamForViewer(viewer)

  const body = PatchBody.safeParse(req.body)
  if (!body.success) return json(res, 400, { error: 'Invalid request body' })

  const target = await getUserById(body.data.userId)
  if (!target) return json(res, 404, { error: 'User not found' })

  // Authorization: must share a team with the target where viewer is a manager.
  const viewerUser = await getUserById(viewer.id)
  if (!viewerUser) return json(res, 401, { error: 'Unauthorized' })

  const sharedTeams = userTeamIds(viewerUser).filter((tid) => userTeamIds(target).includes(tid))
  const canManage = sharedTeams.some((tid) => getRoleForTeam(viewerUser, tid) === 'manager')
  if (!canManage) return json(res, 403, { error: 'Forbidden' })

  const updated = await updateUserProfile(body.data.userId, { name: body.data.name, email: body.data.email })
  if (!updated) return json(res, 404, { error: 'User not found' })

  return json(res, 200, {
    user: {
      userId: updated.id,
      name: updated.name,
      email: updated.email,
    },
  })
}

