export type StandupStatus = 'prepared' | 'partial' | 'missing'

export function calcStatus(fields: {
  yesterday: string
  today: string
  blockers: string
}): StandupStatus {
  const y = fields.yesterday.trim()
  const t = fields.today.trim()
  const b = fields.blockers.trim()

  const filled = [y, t, b].filter(Boolean).length
  if (filled === 0) return 'missing'
  if (filled === 3) return 'prepared'
  return 'partial'
}

export function statusLabel(s: StandupStatus) {
  if (s === 'prepared') return ' Prepared'
  if (s === 'partial') return ' Partial'
  return ' Missing'
}

