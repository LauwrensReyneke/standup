import { describe, expect, test, vi } from 'vitest'

// Important: import after stubbing env so sessionCookie reads the right values.

describe('sessionCookie', () => {
  test('adds Domain when COOKIE_DOMAIN is set', async () => {
    vi.stubEnv('COOKIE_DOMAIN', 'standup-pi.vercel.app')
    vi.stubEnv('NODE_ENV', 'production')

    const { sessionCookie } = await import('./auth')
    const cookie = sessionCookie('token')

    expect(cookie).toContain('standup_session=')
    expect(cookie.toLowerCase()).toContain('domain=standup-pi.vercel.app')
    expect(cookie.toLowerCase()).toContain('samesite=lax')
    expect(cookie.toLowerCase()).toContain('secure')
  })
})

