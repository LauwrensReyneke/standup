import { apiFetch } from './apiClient'

export type SessionUser = {
  id: string
  email: string
  name: string
  role: 'manager' | 'member'
  teamId: string

  activeTeamId?: string
  memberships?: Array<{ teamId: string; role: 'manager' | 'member' }>
}

export async function getSession(): Promise<{ user: SessionUser | null }> {
  return apiFetch('/api/auth?op=session', { method: 'GET' })
}

export async function requestMagicLink(email: string): Promise<{ ok: true }> {
  return apiFetch('/api/auth?op=request-link', {
    method: 'POST',
    body: JSON.stringify({ email, redirectTo: `${location.origin}/login/verify` }),
  })
}

export async function verifyMagicLink(token: string): Promise<{ user: SessionUser }> {
  return apiFetch('/api/auth?op=verify', {
    method: 'POST',
    body: JSON.stringify({ token }),
  })
}

export async function logout(): Promise<{ ok: true }> {
  return apiFetch('/api/auth?op=logout', { method: 'POST' })
}
