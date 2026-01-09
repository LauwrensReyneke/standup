import { describe, expect, test } from 'vitest'
import { calcStatus, type StandupDoc, type StandupRow } from './store'

function applyUpdate(doc: StandupDoc, userId: string, payload: { yesterday: string; today: string; blockers: string }) {
  const idx = doc.rows.findIndex((r) => r.userId === userId)
  if (idx < 0) throw new Error('missing row')
  const row = doc.rows[idx]
  if (typeof row.version !== 'number') row.version = doc.version || 0

  doc.rows[idx] = {
    ...row,
    ...payload,
    status: calcStatus(payload.yesterday, payload.today, payload.blockers),
    version: (row.version || 0) + 1,
  }
  doc.version += 1
}

describe('standup row-level versioning', () => {
  test("member's row version doesn't change when someone else updates", () => {
    const rows: StandupRow[] = [
      { userId: 'u1', name: 'U1', yesterday: '', today: '', blockers: '', status: 'missing', version: 0 },
      { userId: 'u2', name: 'U2', yesterday: '', today: '', blockers: '', status: 'missing', version: 0 },
    ]

    const doc: StandupDoc = { teamId: 't1', date: '2020-01-01', version: 0, updatedAt: 'x', rows, overrides: [] }

    // u2 updates
    applyUpdate(doc, 'u2', { yesterday: 'y', today: 't', blockers: 'b' })

    expect(doc.version).toBe(1)
    expect(doc.rows.find((r) => r.userId === 'u2')?.version).toBe(1)
    expect(doc.rows.find((r) => r.userId === 'u1')?.version).toBe(0)
  })
})

