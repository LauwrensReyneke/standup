import crypto from 'node:crypto'
import type { VercelRequest } from '@vercel/node'
import { parse as parseCookie, serialize as serializeCookie } from 'cookie'

export type SessionUser = {
  id: string
  email: string
  name: string
  role: 'manager' | 'member'
  teamId: string
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
  return buf.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function sign(data: string, secret: string) {
  return base64url(crypto.createHmac('sha256', secret).update(data).digest())
}

function encode(payload: object, secret: string) {
  const body = base64url(JSON.stringify(payload))
  const sig = sign(body, secret)
  return `${body}.${sig}`
}

function decode<T>(token: string, secret: string): T {
  const [body, sig] = token.split('.')
  if (!body || !sig) throw new Error('Invalid token')
  const expected = sign(body, secret)
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) throw new Error('Invalid token')
  return JSON.parse(Buffer.from(body.replaceAll('-', '+').replaceAll('_', '/'), 'base64').toString('utf8')) as T
}

export function makeMagicToken(email: string) {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('Missing AUTH_SECRET')
  const payload: MagicTokenPayload = { email, exp: Date.now() + 15 * 60_000 }
  return encode(payload, secret)
}

export function verifyMagicToken(token: string) {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('Missing AUTH_SECRET')
  const payload = decode<MagicTokenPayload>(token, secret)
  if (Date.now() > payload.exp) throw new Error('Token expired')
  return payload
}

export function makeSessionToken(user: SessionUser) {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('Missing AUTH_SECRET')
  const payload: SessionPayload = { user, exp: Date.now() + 30 * 24 * 60 * 60_000 }
  return encode(payload, secret)
}

export function readSession(req: VercelRequest): SessionUser | null {
  const secret = process.env.AUTH_SECRET
  if (!secret) return null
  const cookies = parseCookie(req.headers.cookie || '')
  const token = cookies['standup_session']
  if (!token) return null
  try {
    const payload = decode<SessionPayload>(token, secret)
    if (Date.now() > payload.exp) return null
    return payload.user
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

