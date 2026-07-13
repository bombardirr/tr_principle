import { describe, expect, it } from 'vitest'
import { findTmMatch } from '@/tm/match'
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
    sourceKey: tmLookupKey(source, 'ru', 'en'),
    sourceLang: 'ru',
    targetLang: 'en',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('tm match', () => {
  it('finds exact match in strict mode', () => {
    const match = findTmMatch(
      [unit('Hello', 'Привет')],
      'Hello',
      'ru',
      'en',
      { punctuationMode: 'strict' },
    )
    expect(match).toEqual({ target: 'Привет', kind: 'exact', score: 1 })
  })

  it('prefers newest exact hit', () => {
    const older = unit('Hello', 'Old', { id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' })
    const newer = unit('Hello', 'New', { id: 'b', updatedAt: '2026-02-01T00:00:00.000Z' })
    const match = findTmMatch([older, newer], 'Hello', 'ru', 'en', {
      punctuationMode: 'strict',
    })
    expect(match?.target).toBe('New')
  })

  it('finds fuzzy match above threshold in strict mode', () => {
    const match = findTmMatch([unit('Hello world', 'Привет мир')], 'Hello worl', 'ru', 'en', {
      punctuationMode: 'strict',
    })
    expect(match?.kind).toBe('fuzzy')
    expect(match?.score).toBeGreaterThanOrEqual(0.85)
    expect(match?.target).toBe('Привет мир')
  })

  it('ignores fuzzy below threshold', () => {
    const match = findTmMatch([unit('Completely different', 'X')], 'Hello', 'ru', 'en', {
      punctuationMode: 'strict',
    })
    expect(match).toBeNull()
  })

  it('soft mode treats trailing punctuation as exact', () => {
    const match = findTmMatch(
      [unit('Вы нам нравитесь.', 'We like you.')],
      'Вы нам нравитесь',
      'ru',
      'en',
      { punctuationMode: 'soft' },
    )
    expect(match?.kind).toBe('exact')
    expect(match?.score).toBe(1)
  })

  it('finds fragment match inside long segment', () => {
    const match = findTmMatch(
      [unit('Вы нам нравитесь.', 'We like you.')],
      'Вы нам нравитесь. Вы нам реально нравитесь. Вы нам нравитесь?',
      'ru',
      'en',
      { punctuationMode: 'soft', enableFragments: true },
    )
    expect(match?.kind).toBe('fragment')
    expect(match?.score).toBe(1)
    expect(match?.target).toBe('We like you.')
    expect(match?.matchedFragment).toBe('Вы нам нравитесь.')
  })
})
