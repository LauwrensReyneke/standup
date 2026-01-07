import type { VercelRequest, VercelResponse } from '@vercel/node'
import { badMethod, json } from '../../_lib/http.js'
import { readSession } from '../../_lib/auth.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return badMethod(req, res, ['GET'])

  const viewer = readSession(req)
  if (!viewer) return json(res, 401, { error: 'Unauthorized' })

  // For now, individual KPI details are provided by /api/kpi/team.
  // This endpoint is kept to satisfy the contract and can be expanded later.
  return json(res, 200, { userId: req.query.id, message: 'Use /api/kpi/team for now' })
}
