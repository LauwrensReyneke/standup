import type { VercelRequest, VercelResponse } from '@vercel/node'
import { badMethod, json } from '../_lib/http'
import { readSession } from '../_lib/auth'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return badMethod(req, res, ['GET'])
  const user = readSession(req)
  return json(res, 200, { user })
}

