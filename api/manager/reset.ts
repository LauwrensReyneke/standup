import type { VercelRequest, VercelResponse } from '@vercel/node'
import { json } from '../_lib/http.js'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  return json(res, 410, { error: 'Gone: use /api/manager/team (POST { confirm: "DELETE" })' })
}

