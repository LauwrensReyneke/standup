import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { badMethod, json } from '../_lib/http.js'
import { verifyMagicToken, makeSessionToken, sessionCookie } from '../_lib/auth.js'
import { ensureBootstrapTeamAndManager, getUserByEmail } from '../_lib/store.js'
import { isEmailAllowed } from '../_lib/allowlist.js'

const Body = z.object({ token: z.string().min(10) })

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return badMethod(req, res, ['POST'])

  await ensureBootstrapTeamAndManager()

  const body = Body.safeParse(req.body)
  if (!body.success) return json(res, 400, { error: 'Invalid request body' })

  let email: string
  try {
    email = verifyMagicToken(body.data.token).email
  } catch (e: any) {
    return json(res, 401, { error: e?.message || 'Invalid token' })
  }

  if (!isEmailAllowed(email)) return json(res, 403, { error: 'Not authorized' })

  await ensureBootstrapTeamAndManager({ email, name: email.split('@')[0] })

  const user = await getUserByEmail(email)
  if (!user) return json(res, 403, { error: 'User not found' })

  const sessionToken = makeSessionToken({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    teamId: user.teamId,
  })

  res.setHeader('set-cookie', sessionCookie(sessionToken))
  return json(res, 200, {
    user: { id: user.id, email: user.email, name: user.name, role: user.role, teamId: user.teamId },
  })
}
