import { describe, expect, test } from 'vitest'
import { getRoleForTeam, userTeamIds } from './store'

describe('multi-team helpers', () => {
  test('getRoleForTeam falls back to per-team membership', () => {
    const user: any = {
      id: 'u1',
      email: 'a@example.com',
      name: 'A',
      role: 'member',
      teamId: 't1',
      activeTeamId: 't1',
      memberships: [
        { teamId: 't1', role: 'member', joinedAt: '2020-01-01T00:00:00.000Z' },
        { teamId: 't2', role: 'manager', joinedAt: '2020-01-01T00:00:00.000Z' },
      ],
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    }

    expect(getRoleForTeam(user, 't1')).toBe('member')
    expect(getRoleForTeam(user, 't2')).toBe('manager')
  })

  test('userTeamIds migrates legacy teamId into memberships when needed', () => {
    const legacy: any = {
      id: 'u1',
      email: 'a@example.com',
      name: 'A',
      role: 'manager',
      teamId: 't1',
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    }

    expect(userTeamIds(legacy)).toEqual(['t1'])
    expect(getRoleForTeam(legacy, 't1')).toBe('manager')
  })
})

describe('teamCode', () => {
  test('team objects may include a teamCode string', () => {
    const team: any = { id: 't1', name: 'T', standupCutoffTime: '09:30', memberUserIds: [], teamCode: 'abc123' }
    expect(typeof team.teamCode).toBe('string')
  })
})
