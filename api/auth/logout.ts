import type { VercelRequest, VercelResponse } from '@vercel/node'
import { badMethod, json } from '../_lib/http'
import { sessionCookie } from '../_lib/auth'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return badMethod(req, res, ['POST'])
  res.setHeader('set-cookie', sessionCookie(null))
  return json(res, 200, { ok: true })
}

