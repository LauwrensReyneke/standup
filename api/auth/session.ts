import type { VercelRequest, VercelResponse } from '@vercel/node'
import { badMethod, json } from '../_lib/http'
import { readSession, sessionCookie } from '../_lib/auth'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Consolidated auth endpoints (Hobby plan function limit):
  // - GET  /api/auth/session
  // - POST /api/auth/logout (rewired to this file)

  // Vercel will route based on the filename, so to keep the same public URLs
  // we rewire /api/auth/logout by turning that file into a re-export.

  if (req.method === 'GET') {
    const user = readSession(req)
    return json(res, 200, { user })
  }

  if (req.method === 'POST') {
    // Logout behavior
    res.setHeader('set-cookie', sessionCookie(null))
    return json(res, 200, { ok: true })
  }

  return badMethod(req, res, ['GET', 'POST'])
}
