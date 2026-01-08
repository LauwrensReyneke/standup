import type { VercelRequest, VercelResponse } from '@vercel/node'
import { badMethod, json, withReqId } from '../_lib/http.js'
import { readSession } from '../_lib/auth.js'
import { findBlob, getTeam, teamKey, usersKey } from '../_lib/store.js'

/**
 * Debug endpoint to diagnose "Team not found" issues.
 * Returns key/session info without exposing secrets.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return badMethod(req, res, ['GET'])

  const reqId = withReqId(res)
  const viewer = await readSession(req)

  if (!viewer) {
    return json(res, 200, {
      reqId,
      ok: false,
      reason: 'no-session',
      hasCookie: Boolean(req.headers.cookie),
    })
  }

  const teamBlob = await findBlob(teamKey(viewer.teamId))
  const team = await getTeam(viewer.teamId)
  const userBlob = await findBlob(usersKey(viewer.id))

  return json(res, 200, {
    reqId,
    ok: true,
    viewer,
    keys: {
      teamKey: teamKey(viewer.teamId),
      userKey: usersKey(viewer.id),
    },
    blobs: {
      teamFoundByList: Boolean(teamBlob),
      userFoundByList: Boolean(userBlob),
      teamUrl: teamBlob?.url || null,
      userUrl: userBlob?.url || null,
    },
    team: team || null,
  })
}

