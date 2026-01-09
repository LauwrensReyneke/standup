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

    const text = `Sign in to Standups:\n\n${verifyUrl}\n\nThis link expires in 15 minutes. If you didn't request this email, you can ignore it.`

    const escapedUrl = verifyUrl.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

    const html = `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>Sign in to Standups</title>
  </head>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f1f5f9;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="padding:22px 24px;background:linear-gradient(135deg,#0f172a,#334155);color:#ffffff;">
                <div style="font-size:14px;letter-spacing:.08em;text-transform:uppercase;opacity:.9;">Standups</div>
                <div style="font-size:22px;font-weight:700;margin-top:6px;line-height:1.2;">Sign in to your account</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 24px 8px 24px;color:#0f172a;">
                <p style="margin:0 0 14px 0;font-size:15px;line-height:1.55;">Use the button below to sign in. This link expires in <strong>15 minutes</strong>.</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:8px 24px 18px 24px;">
                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${escapedUrl}" style="height:46px;v-text-anchor:middle;width:220px;" arcsize="12%" stroke="f" fillcolor="#2563eb">
                  <w:anchorlock/>
                  <center style="color:#ffffff;font-family:Segoe UI, Arial, sans-serif;font-size:16px;font-weight:bold;">Sign in</center>
                </v:roundrect>
                <![endif]-->
                <!--[if !mso]><!-- -->
                <a href="${escapedUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:700;font-size:16px;">Sign in</a>
                <!--<![endif]-->
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 20px 24px;color:#334155;">
                <p style="margin:0 0 10px 0;font-size:12px;line-height:1.6;color:#64748b;">If the button doesn’t work, copy and paste this URL into your browser:</p>
                <p style="margin:0;font-size:12px;line-height:1.6;word-break:break-all;">
                  <a href="${escapedUrl}" style="color:#2563eb;text-decoration:underline;">${escapedUrl}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px 22px 24px;border-top:1px solid #e2e8f0;color:#64748b;">
                <p style="margin:0;font-size:12px;line-height:1.6;">If you didn't request this email, you can safely ignore it.</p>
              </td>
            </tr>
          </table>
          <div style="max-width:560px;margin:14px auto 0 auto;color:#94a3b8;font-size:11px;line-height:1.4;text-align:center;">
            <div>Sent by Standups</div>
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>
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
