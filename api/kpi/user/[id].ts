import type { VercelRequest, VercelResponse } from '@vercel/node'
import { badMethod, json } from '../../_lib/http.js'
import { readSession } from '../../_lib/auth.js'
import { findBlob, getTeam, teamKey, usersKey } from '../../_lib/store.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return badMethod(req, res, ['GET'])

  const viewer = await readSession(req)
  if (!viewer) return json(res, 401, { error: 'Unauthorized' })

  // Hidden debug mode (used via Vercel rewrite from /api/debug/team).
  if (req.query.id === 'debug-team') {
    const teamId = viewer.activeTeamId || viewer.teamId
    const teamBlob = await findBlob(teamKey(teamId))
    const team = await getTeam(teamId)
    const userBlob = await findBlob(usersKey(viewer.id))

    return json(res, 200, {
      ok: true,
      viewer,
      keys: {
        teamKey: teamKey(teamId),
        userKey: usersKey(viewer.id),
      },
      blobs: {
        teamFoundByList: Boolean(teamBlob),
        userFoundByList: Boolean(userBlob),
        teamUrl: teamBlob?.url || null,
        userUrl: userBlob?.url || null,
      },
      team: team || null,
      note: 'This response is served by /api/kpi/user/[id] via a rewrite to avoid Hobby plan function limits.',
    })
  }

  // For now, individual KPI details are provided by /api/kpi/team.
  // This endpoint is kept to satisfy the contract and can be expanded later.
  return json(res, 200, { userId: req.query.id, message: 'Use /api/kpi/team for now' })
}
