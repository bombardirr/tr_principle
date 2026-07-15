import { describe, expect, it } from 'vitest'
import { formatCompactDate } from '@/utils/formatDate'

describe('formatCompactDate', () => {
  it('formats RU date with numeric month', () => {
    const s = formatCompactDate('2026-07-14T12:00:00.000Z', 'ru-RU')
    expect(s).toMatch(/14/)
    expect(s).toMatch(/07/)
    expect(s).toMatch(/2026/)
    expect(s.toLowerCase()).not.toMatch(/июл|г\./)
  })
})
