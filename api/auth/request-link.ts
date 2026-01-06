import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { badMethod, json } from '../_lib/http'
import { ensureBootstrapTeamAndManager, getUserByEmail, upsertUser } from '../_lib/store'
import { makeMagicToken } from '../_lib/auth'
import { isEmailAllowed } from '../_lib/allowlist'

const Body = z.object({
  email: z.string().email(),
  redirectTo: z.string().url().optional(),
})

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return badMethod(req, res, ['POST'])

  await ensureBootstrapTeamAndManager()

  const body = Body.safeParse(req.body)
  if (!body.success) return json(res, 400, { error: 'Invalid request body' })

  const email = body.data.email.toLowerCase()

  if (!isEmailAllowed(email)) {
    return json(res, 403, { error: 'Not authorized' })
  }

  const user = await getUserByEmail(email)
  if (!user) {
    return json(res, 403, { error: 'Not authorized (ask your manager to add you)' })
  }

  // Update email casing consistency
  await upsertUser({ ...user, email })

  const token = makeMagicToken(email)
  const verifyUrl = `${body.data.redirectTo || ''}?token=${encodeURIComponent(token)}`

  const mode = process.env.DEV_EMAIL_MODE || 'provider'
  if (mode === 'log') {
    console.log(`[magic-link] ${email} -> ${verifyUrl}`)
    return json(res, 200, { ok: true })
  }

  const resendKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!resendKey || !from) {
    console.log(`[magic-link] Missing RESEND_API_KEY/EMAIL_FROM. Link for ${email}: ${verifyUrl}`)
    return json(res, 200, { ok: true })
  }

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${resendKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'Your Standup magic link',
      html: `<p>Sign in to STRICT Standups:</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>This link expires in 15 minutes.</p>`,
    }),
  })

  if (!resp.ok) {
    const t = await resp.text()
    console.log('[resend] error', resp.status, t)
    return json(res, 500, { error: 'Failed to send email' })
  }

  return json(res, 200, { ok: true })
}
