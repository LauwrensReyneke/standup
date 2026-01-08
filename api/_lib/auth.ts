import crypto from 'node:crypto'
import type { VercelRequest } from '@vercel/node'
import { parse as parseCookie, serialize as serializeCookie } from 'cookie'
import { SignJWT, jwtVerify, errors as JoseErrors } from 'jose'

export type SessionUser = {
  id: string
  email: string
  name: string
  /** Legacy global role (kept for backward compatibility) */
  role: 'manager' | 'member'
  /** Legacy single team (kept for backward compatibility) */
  teamId: string

  /** Multi-team fields */
  activeTeamId?: string
  memberships?: Array<{ teamId: string; role: 'manager' | 'member' }>
}

type MagicTokenPayload = {
  email: string
  exp: number
}

type SessionPayload = {
  user: SessionUser
  exp: number
}

function base64url(input: Buffer | string) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input)
  return buf
    .toString('base64')
    .split('+').join('-')
    .split('/').join('_')
    .split('=').join('')
}

function sign(data: string, secret: string) {
  return base64url(crypto.createHmac('sha256', secret).update(data).digest())
}

function decode<T>(token: string, secret: string): T {
  const [body, sig] = token.split('.')
  if (!body || !sig) throw new Error('Invalid token')
  const expected = sign(body, secret)
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) throw new Error('Invalid token')
  const b64 = body.split('-').join('+').split('_').join('/')
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) as T
}

function jwtSecretKey() {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('Missing AUTH_SECRET')
  return new TextEncoder().encode(secret)
}

export async function makeMagicToken(email: string) {
  // 15 minutes
  const expiresInSeconds = 15 * 60
  const now = Math.floor(Date.now() / 1000)

  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(now)
    .setExpirationTime(now + expiresInSeconds)
    .setSubject(email)
    .setAudience('standup:magic')
    .setIssuer('standup')
    .sign(jwtSecretKey())
}

export async function verifyMagicToken(token: string): Promise<{ email: string }> {
  // Accept legacy 2-part token during transition.
  const parts = token.split('.')
  if (parts.length === 2) {
    const secret = process.env.AUTH_SECRET
    if (!secret) throw new Error('Missing AUTH_SECRET')
    const payload = decode<MagicTokenPayload>(token, secret)
    if (Date.now() > payload.exp) throw new Error('Token expired')
    return { email: payload.email }
  }

  try {
    const { payload } = await jwtVerify(token, jwtSecretKey(), {
      issuer: 'standup',
      audience: 'standup:magic',
    })

    const email = typeof payload.email === 'string' ? payload.email : ''
    if (!email) return Promise.reject(new Error('Invalid token'))
    return { email }
  } catch (e: any) {
    if (e instanceof JoseErrors.JWTExpired) throw new Error('Token expired')
    throw new Error('Invalid token')
  }
}

export async function makeSessionToken(user: SessionUser) {
  // 30 days
  const expiresInSeconds = 30 * 24 * 60 * 60
  const now = Math.floor(Date.now() / 1000)

  return new SignJWT({ user })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt(now)
    .setExpirationTime(now + expiresInSeconds)
    .setSubject(user.id)
    .setAudience('standup:session')
    .setIssuer('standup')
    .sign(jwtSecretKey())
}

export async function readSession(req: VercelRequest): Promise<SessionUser | null> {
  const secret = process.env.AUTH_SECRET
  if (!secret) return null
  const cookies = parseCookie(req.headers.cookie || '')
  const token = cookies['standup_session']
  if (!token) return null

  // Accept legacy 2-part token during transition.
  if (token.split('.').length === 2) {
    try {
      const payload = decode<SessionPayload>(token, secret)
      if (Date.now() > payload.exp) return null
      return payload.user
    } catch {
      return null
    }
  }

  try {
    const { payload } = await jwtVerify(token, jwtSecretKey(), {
      issuer: 'standup',
      audience: 'standup:session',
    })

    const u = (payload.user || null) as any
    if (!u || typeof u.id !== 'string') return null
    return u as SessionUser
  } catch {
    return null
  }
}

export function sessionCookie(value: string | null) {
  const secure = process.env.NODE_ENV === 'production'
  return serializeCookie('standup_session', value ?? '', {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: value ? 60 * 60 * 24 * 30 : 0,
  })
}
