import type { VercelRequest, VercelResponse } from '@vercel/node'
import { z } from 'zod'
import { badMethod, json } from './_lib/http.js'
import { makeMagicToken, makeSessionToken, readSession, sessionCookie, verifyMagicToken } from './_lib/auth.js'
import { ensureBootstrapTeamAndManager, getUserByEmail, upsertUser, ensureTeamForViewer, getUserById, getRoleForTeam, userTeamIds } from './_lib/store.js'
import { isEmailAllowed } from './_lib/allowlist.js'

function opFrom(req: VercelRequest): string {
  return String((req.query.op as any) || '').toLowerCase()
}

const RequestLinkBody = z.object({ email: z.string().email(), redirectTo: z.string().url().optional() })
const VerifyBody = z.object({ token: z.string().min(10) })
const SelectTeamBody = z.object({ teamId: z.string().min(5) })

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const op = opFrom(req)

  // GET /api/auth?op=session
  if (req.method === 'GET' && op === 'session') {
    const user = await readSession(req)
    return json(res, 200, { user })
  }

  // POST /api/auth?op=logout
  if (req.method === 'POST' && op === 'logout') {
    res.setHeader('set-cookie', sessionCookie(null))
    return json(res, 200, { ok: true })
  }

  // PUT /api/auth?op=select-team
  if (req.method === 'PUT' && op === 'select-team') {
    await ensureBootstrapTeamAndManager()

    const viewer = await readSession(req)
    if (!viewer) return json(res, 401, { error: 'Unauthorized' })

    await ensureTeamForViewer(viewer)

    const body = SelectTeamBody.safeParse(req.body)
    if (!body.success) return json(res, 400, { error: 'Invalid request body' })

    const user = await getUserById(viewer.id)
    if (!user) return json(res, 401, { error: 'Unauthorized' })

    const allowedTeamIds = new Set(userTeamIds(user))
    if (!allowedTeamIds.has(body.data.teamId)) return json(res, 403, { error: 'Not a member of that team' })

    user.activeTeamId = body.data.teamId
    user.teamId = body.data.teamId
    user.role = getRoleForTeam(user, body.data.teamId)

    const token = await makeSessionToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: getRoleForTeam(user, body.data.teamId),
      teamId: body.data.teamId,
      activeTeamId: body.data.teamId,
      memberships: (user.memberships || []).map((m) => ({ teamId: m.teamId, role: m.role })),
    })

    res.setHeader('set-cookie', sessionCookie(token))
    return json(res, 200, { ok: true, activeTeamId: body.data.teamId })
  }

  // POST /api/auth?op=request-link
  if (req.method === 'POST' && op === 'request-link') {
    const body = RequestLinkBody.safeParse(req.body)
    if (!body.success) return json(res, 400, { error: 'Invalid request body' })

    const email = body.data.email.toLowerCase()
    if (!isEmailAllowed(email)) return json(res, 403, { error: 'Not authorized' })

    await ensureBootstrapTeamAndManager({ email, name: email.split('@')[0] })

    const user = await getUserByEmail(email)
    if (!user) return json(res, 403, { error: 'Not authorized (ask your manager to add you)' })

    await upsertUser({ ...user, email })

    const token = await makeMagicToken(email)
    const verifyUrl = `${body.data.redirectTo || ''}?token=${encodeURIComponent(token)}`

    const modeRaw = (process.env.DEV_EMAIL_MODE || '').toLowerCase()
    const mode = modeRaw === 'send' ? 'provider' : modeRaw || 'provider'
    if (mode === 'log') {
      console.log(`[magic-link] ${email} -> ${verifyUrl}`)
      return json(res, 200, { ok: true })
    }

    const resendKey = process.env.RESEND_API_KEY
    const from = process.env.EMAIL_FROM || 'Standups <noreply@updates.r-e-d.online>'
    if (!resendKey) {
      console.log(`[magic-link] Missing RESEND_API_KEY. Link for ${email}: ${verifyUrl}`)
      return json(res, 200, { ok: true })
    }

    const text = `Sign in to Standups:\n\n${verifyUrl}\n\nThis link expires in 15 minutes. If you didnt request this email, you can ignore it.`
    const html = `
      <p>Sign in to Standups:</p>
      <p><a href="${verifyUrl}">Sign in</a></p>
      <p style="color:#64748b;font-size:12px;line-height:1.4">
        This link expires in 15 minutes. If you didnt request this email, you can ignore it.
      </p>
    `.trim()

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${resendKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: 'Your Standup sign-in link',
        text,
        html,
        tracking: { click: false, open: false },
      }),
    })

    if (!resp.ok) {
      const t = await resp.text()
      console.log('[resend] error', resp.status, t)
      return json(res, 500, { error: 'Failed to send email' })
    }

    return json(res, 200, { ok: true })
  }

  // POST /api/auth?op=verify
  if (req.method === 'POST' && op === 'verify') {
    await ensureBootstrapTeamAndManager()

    const body = VerifyBody.safeParse(req.body)
    if (!body.success) return json(res, 400, { error: 'Invalid request body' })

    let email: string
    try {
      email = (await verifyMagicToken(body.data.token)).email
    } catch (e: any) {
      return json(res, 401, { error: e?.message || 'Invalid token' })
    }

    if (!isEmailAllowed(email)) return json(res, 403, { error: 'Not authorized' })

    await ensureBootstrapTeamAndManager({ email, name: email.split('@')[0] })

    const user = await getUserByEmail(email)
    if (!user) return json(res, 403, { error: 'User not found' })

    const sessionToken = await makeSessionToken({
      id: user.id,
      email: user.email,
      name: user.name,
      role: (user.role as any) || 'member',
      teamId: (user.teamId as any) || user.activeTeamId || '',
      activeTeamId: user.activeTeamId || user.teamId || '',
      memberships: (user.memberships || []).map((m) => ({ teamId: m.teamId, role: m.role })),
    })

    res.setHeader('set-cookie', sessionCookie(sessionToken))
    return json(res, 200, {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: (user.role as any) || 'member',
        teamId: (user.teamId as any) || user.activeTeamId || '',
        activeTeamId: user.activeTeamId || user.teamId || '',
        memberships: (user.memberships || []).map((m) => ({ teamId: m.teamId, role: m.role })),
      },
    })
  }

  return badMethod(req, res, ['GET', 'POST', 'PUT'])
}

