import { describe, expect, it } from 'vitest'
import { exportTbx, parseTbx } from '@/glossary/tbx'
import type { GlossaryTerm } from '@/types/glossary'

const sample: GlossaryTerm = {
  id: '11111111-1111-4111-8111-111111111111',
  sourceLang: 'en',
  targetLang: 'ru',
  sourceTerm: 'invoice',
  targetTerm: 'счёт',
  status: 'approved',
  caseSensitive: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
}

describe('tbx', () => {
  it('round-trips core fields', () => {
    const xml = exportTbx([sample])
    const parsed = parseTbx(xml)
    expect(parsed).toHaveLength(1)
    expect(parsed[0]!.sourceTerm).toBe('invoice')
    expect(parsed[0]!.targetTerm).toBe('счёт')
    expect(parsed[0]!.sourceLang).toBe('en')
    expect(parsed[0]!.targetLang).toBe('ru')
    expect(parsed[0]!.id).toBe(sample.id)
  })

  it('preserves forbidden via note', () => {
    const xml = exportTbx([{ ...sample, status: 'forbidden', note: 'legacy' }])
    const parsed = parseTbx(xml)
    expect(parsed[0]!.status).toBe('forbidden')
  })
})
