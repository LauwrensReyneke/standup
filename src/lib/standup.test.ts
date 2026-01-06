import { describe, expect, it } from 'vitest'
import { calcStatus } from './standup'

describe('calcStatus', () => {
  it('missing when all empty', () => {
    expect(calcStatus({ yesterday: '', today: '', blockers: '' })).toBe('missing')
  })

  it('partial when some fields filled', () => {
    expect(calcStatus({ yesterday: 'x', today: '', blockers: '' })).toBe('partial')
  })

  it('prepared when all fields filled', () => {
    expect(calcStatus({ yesterday: 'x', today: 'y', blockers: 'None' })).toBe('prepared')
  })
})

