import { describe, expect, it } from 'vitest'
import { findGlossaryHits, plainTextWithGlossaryMarks } from '@/glossary/match'
import type { GlossaryTerm } from '@/types/glossary'

function term(partial: Partial<GlossaryTerm> & Pick<GlossaryTerm, 'sourceTerm' | 'targetTerm'>): GlossaryTerm {
  const now = '2026-01-01T00:00:00.000Z'
  return {
    id: partial.id ?? crypto.randomUUID(),
    baseId: partial.baseId ?? 'personal-glossary',
    sourceLang: partial.sourceLang ?? 'en',
    targetLang: partial.targetLang ?? 'ru',
    sourceTerm: partial.sourceTerm,
    targetTerm: partial.targetTerm,
    status: partial.status ?? 'approved',
    caseSensitive: partial.caseSensitive ?? false,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...partial,
  }
}

describe('findGlossaryHits', () => {
  it('finds case-insensitive hits and prefers longer terms', () => {
    const terms = [
      term({ id: '1', sourceTerm: 'data', targetTerm: 'данные' }),
      term({ id: '2', sourceTerm: 'data center', targetTerm: 'ЦОД' }),
    ]
    const hits = findGlossaryHits('The Data Center is ready', terms, 'en', 'ru')
    expect(hits).toHaveLength(1)
    expect(hits[0]!.termId).toBe('2')
    expect(hits[0]!.targetTerm).toBe('ЦОД')
  })

  it('skips partial word matches', () => {
    const terms = [term({ sourceTerm: 'cat', targetTerm: 'кот' })]
    expect(findGlossaryHits('concatenation', terms, 'en', 'ru')).toHaveLength(0)
    expect(findGlossaryHits('a cat sat', terms, 'en', 'ru')).toHaveLength(1)
  })

  it('marks forbidden status', () => {
    const terms = [term({ sourceTerm: 'foo', targetTerm: 'бар', status: 'forbidden' })]
    const hits = findGlossaryHits('foo bar', terms, 'en', 'ru')
    expect(hits[0]!.status).toBe('forbidden')
    expect(plainTextWithGlossaryMarks('foo bar', hits)).toContain('glossary-hit--forbidden')
  })

  it('keeps multiple target variants for the same source span', () => {
    const terms = [
      term({ id: 'a', sourceTerm: 'server', targetTerm: 'сервер' }),
      term({ id: 'b', sourceTerm: 'server', targetTerm: 'сервак', status: 'forbidden' }),
    ]
    const hits = findGlossaryHits('The server is up', terms, 'en', 'ru')
    expect(hits).toHaveLength(2)
    expect(hits.map((h) => h.targetTerm).sort()).toEqual(['сервак', 'сервер'])
    expect(hits.every((h) => h.start === hits[0]!.start && h.end === hits[0]!.end)).toBe(true)
  })
})
