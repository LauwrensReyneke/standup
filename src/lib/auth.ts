import { apiFetch } from './apiClient'

export type SessionUser = {
  id: string
  email: string
  name: string
  role: 'manager' | 'member'
  teamId: string
}

export async function getSession(): Promise<{ user: SessionUser | null }> {
  return apiFetch('/api/auth/session', { method: 'GET' })
}

export async function requestMagicLink(email: string): Promise<{ ok: true }> {
  return apiFetch('/api/auth/request-link', {
    method: 'POST',
    body: JSON.stringify({ email, redirectTo: `${location.origin}/login/verify` }),
  })
}

export async function verifyMagicLink(token: string): Promise<{ user: SessionUser }> {
  return apiFetch('/api/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ token }),
  })
}

export async function logout(): Promise<{ ok: true }> {
  // POST is handled by /api/auth/session (consolidated endpoint)
  return apiFetch('/api/auth/session', { method: 'POST' })
}
