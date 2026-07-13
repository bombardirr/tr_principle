import { describe, expect, it } from 'vitest'
import { findExactTmMatch, findTmMatch } from '@/tm/match'
import { tmLookupKey } from '@/tm/normalize'
import type { TmUnit } from '@/types/tm'

function unit(
  source: string,
  target: string,
  overrides: Partial<TmUnit> = {},
): TmUnit {
  return {
    id: 'u1',
    source,
    target,
    sourceKey: tmLookupKey(source, 'en', 'ru'),
    sourceLang: 'en',
    targetLang: 'ru',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('tm match', () => {
  it('finds exact match', () => {
    const match = findExactTmMatch([unit('Hello', 'Привет')], 'Hello', 'en', 'ru')
    expect(match).toEqual({ target: 'Привет', kind: 'exact', score: 1 })
  })

  it('prefers newest exact hit', () => {
    const older = unit('Hello', 'Old', { id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' })
    const newer = unit('Hello', 'New', { id: 'b', updatedAt: '2026-02-01T00:00:00.000Z' })
    const match = findExactTmMatch([older, newer], 'Hello', 'en', 'ru')
    expect(match?.target).toBe('New')
  })

  it('finds fuzzy match above threshold', () => {
    const match = findTmMatch([unit('Hello world', 'Привет мир')], 'Hello worl', 'en', 'ru')
    expect(match?.kind).toBe('fuzzy')
    expect(match?.score).toBeGreaterThanOrEqual(0.85)
    expect(match?.target).toBe('Привет мир')
  })

  it('ignores fuzzy below threshold', () => {
    const match = findTmMatch([unit('Completely different', 'X')], 'Hello', 'en', 'ru')
    expect(match).toBeNull()
  })
})
