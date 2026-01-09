import { describe, expect, test } from 'vitest'

type Row = { userId: string; today: string }

type TodayResponse = {
  etag: string
  rows: Row[]
  date: string
  cutoffAt: string
  editable: boolean
  teamName: string
  viewer: { userId: string; role: 'manager' | 'member' }
}

function mergeLatestIntoCurrent(current: TodayResponse, latest: TodayResponse, dirty: Set<string>) {
  const latestById = new Map(latest.rows.map((r) => [r.userId, r]))

  const mergedRows = current.rows.map((r) => {
    if (dirty.has(r.userId)) return r
    const fromServer = latestById.get(r.userId)
    return fromServer ? fromServer : r
  })

  for (const [userId, row] of latestById) {
    if (!mergedRows.some((x) => x.userId === userId)) mergedRows.push(row)
  }

  current.etag = latest.etag
  current.rows = mergedRows
}

describe('poll merge', () => {
  test('does not clobber dirty rows', () => {
    const current: TodayResponse = {
      etag: '1',
      date: 'x',
      cutoffAt: 'x',
      editable: true,
      teamName: 't',
      viewer: { userId: 'u1', role: 'member' },
      rows: [
        { userId: 'u1', today: 'LOCAL' },
        { userId: 'u2', today: 'OLD2' },
      ],
    }

    const latest: TodayResponse = {
      ...current,
      etag: '2',
      rows: [
        { userId: 'u1', today: 'SERVER1' },
        { userId: 'u2', today: 'SERVER2' },
      ],
    }

    mergeLatestIntoCurrent(current, latest, new Set(['u1']))

    expect(current.etag).toBe('2')
    expect(current.rows.find((r) => r.userId === 'u1')?.today).toBe('LOCAL')
    expect(current.rows.find((r) => r.userId === 'u2')?.today).toBe('SERVER2')
  })
})

