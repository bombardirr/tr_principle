import { describe, expect, it } from 'vitest'
import { findTmMatch, buildTmApplyTarget, findTmMatches } from '@/tm/match'
import { tmLookupKey } from '@/tm/normalize'
import type { TmUnit } from '@/types/tm'

const S1 = 'Вы нам нравитесь.'

function unit(
  source: string,
  target: string,
  overrides: Partial<TmUnit> = {},
): TmUnit {
  return {
    id: 'u1',
    baseId: 'personal-tm',
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
    expect(match).toMatchObject({ target: 'Привет', kind: 'exact', score: 1 })
    expect(match?.unitId).toBe('u1')
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
      fuzzyMinScore: 0.85,
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

  it('does not treat tag-mismatched same text as exact', () => {
    const match = findTmMatch(
      [unit('{1}Hello{2}', 'Привет')],
      'Hello',
      'ru',
      'en',
      { punctuationMode: 'strict' },
    )
    expect(match?.kind).toBe('fuzzy')
    expect(match?.score).toBeLessThan(1)
    expect(match?.score).toBeGreaterThanOrEqual(0.85)
  })

  it('keeps exact when tag sequences match', () => {
    const match = findTmMatch(
      [unit('{1}Hello{2}{3} world{4}', '{1}Привет{2}{3} мир{4}')],
      '{1}Hello{2}{3} world{4}',
      'ru',
      'en',
      { punctuationMode: 'strict' },
    )
    expect(match?.kind).toBe('exact')
    expect(match?.score).toBe(1)
  })

  it('lowers fuzzy score when tags differ', () => {
    const withTags = findTmMatch(
      [unit('{1}Hello world{2}', 'Привет мир')],
      'Hello worl',
      'ru',
      'en',
      { punctuationMode: 'strict', fuzzyMinScore: 0.5 },
    )
    const plain = findTmMatch(
      [unit('Hello world', 'Привет мир')],
      'Hello worl',
      'ru',
      'en',
      { punctuationMode: 'strict', fuzzyMinScore: 0.5 },
    )
    expect(withTags?.kind).toBe('fuzzy')
    expect(plain?.kind).toBe('fuzzy')
    expect(withTags!.score).toBeLessThan(plain!.score)
  })

  it('soft mode treats trailing punctuation as exact', () => {
    const match = findTmMatch(
      [unit(S1, 'We like you.')],
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
      [unit(S1, 'We like you.')],
      `${S1} Вы нам реально нравитесь. Вы нам нравитесь?`,
      'ru',
      'en',
      { punctuationMode: 'soft', enableFragments: true },
    )
    expect(match?.kind).toBe('fragment')
    expect(match?.score).toBe(1)
    expect(match?.target).toBe('We like you.')
    expect(match?.matchedFragment).toBe(S1)
  })

  it('assembles apply target from all matching fragments', () => {
    const target = buildTmApplyTarget(
      [unit(S1, 'We like you.')],
      `${S1} Вы нам реально нравитесь. Вы нам нравитесь?`,
      'ru',
      'en',
      { punctuationMode: 'soft', enableFragments: true },
    )
    expect(target).toBe(
      'We like you. Вы нам реально нравитесь. We like you.',
    )
  })

  it('ignores incomplete whole-segment TU when sentence TUs exist', () => {
    const composite = `${S1} Вы нам реально нравитесь. Вы нам нравитесь?`
    const target = buildTmApplyTarget(
      [
        unit(composite, 'We like you.', { id: 'whole' }),
        unit(S1, 'We like you.', { id: 'frag' }),
      ],
      composite,
      'ru',
      'en',
      { punctuationMode: 'soft', enableFragments: true },
    )
    expect(target).toBe(
      'We like you. Вы нам реально нравитесь. We like you.',
    )
  })

  it('falls back to whole-segment TU when no sentence TUs exist', () => {
    const composite = `${S1} Вы нам реально нравитесь.`
    const target = buildTmApplyTarget(
      [unit(composite, 'We like you. We really like you.')],
      composite,
      'ru',
      'en',
      { punctuationMode: 'soft', enableFragments: true },
    )
    expect(target).toBe('We like you. We really like you.')
  })

  it('prefers period TM over newer question TM for unpunctuated fragment', () => {
    const units = [
      unit(S1, 'We like you.', {
        id: 'a',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
      unit('Вы нам нравитесь?', 'We like you?', {
        id: 'b',
        updatedAt: '2026-02-01T00:00:00.000Z',
      }),
    ]
    const target = buildTmApplyTarget(
      units,
      `${S1} Вы нам реально нравитесь. Вы нам нравитесь`,
      'ru',
      'en',
      { punctuationMode: 'soft', enableFragments: true },
    )
    expect(target).toBe(
      'We like you. Вы нам реально нравитесь. We like you.',
    )
  })

  it('lists all exact variants for picker', () => {
    const matches = findTmMatches(
      [
        unit(S1, 'I am Artem.', {
          id: 'a',
          updatedAt: '2026-01-01T00:00:00.000Z',
        }),
        unit(S1, "I'm Artem.", {
          id: 'b',
          updatedAt: '2026-02-01T00:00:00.000Z',
        }),
      ],
      S1,
      'ru',
      'en',
      { punctuationMode: 'soft', fuzzyMinScore: 1 },
    )
    expect(matches).toHaveLength(2)
    expect(matches.map((m) => m.target)).toEqual(["I'm Artem.", 'I am Artem.'])
  })

  it('marks 101% context match when neighbors match', () => {
    const matches = findTmMatches(
      [
        unit('Click Next.', 'Нажмите «Далее».', {
          id: 'ctx',
          contextBefore: 'Open the wizard.',
          contextAfter: 'Confirm the choice.',
          updatedAt: '2026-01-01T00:00:00.000Z',
        }),
        unit('Click Next.', 'Жмите Далее.', {
          id: 'plain',
          contextBefore: 'Something else.',
          contextAfter: 'Other.',
          updatedAt: '2026-02-01T00:00:00.000Z',
        }),
      ],
      'Click Next.',
      'ru',
      'en',
      {
        punctuationMode: 'strict',
        contextBefore: 'Open the wizard.',
        contextAfter: 'Confirm the choice.',
      },
    )
    expect(matches[0]?.kind).toBe('context')
    expect(matches[0]?.score).toBe(1.01)
    expect(matches[0]?.target).toBe('Нажмите «Далее».')
    expect(matches[1]?.kind).toBe('exact')
    expect(matches[1]?.score).toBe(1)
  })

  it('keeps plain exact when TU has no stored neighbors', () => {
    const matches = findTmMatches(
      [
        unit('Click Next.', 'Жмите Далее.', {
          id: 'plain',
          updatedAt: '2026-02-01T00:00:00.000Z',
        }),
      ],
      'Click Next.',
      'ru',
      'en',
      {
        punctuationMode: 'strict',
        contextBefore: 'Before.',
        contextAfter: 'After.',
      },
    )
    expect(matches[0]?.kind).toBe('exact')
    expect(matches[0]?.score).toBe(1)
  })

  it('prefers context match in findTmMatch', () => {
    const match = findTmMatch(
      [
        unit('Click Next.', 'Wrong.', {
          id: 'a',
          contextBefore: 'A',
          contextAfter: 'B',
          updatedAt: '2026-03-01T00:00:00.000Z',
        }),
        unit('Click Next.', 'Right.', {
          id: 'b',
          contextBefore: 'Before.',
          contextAfter: 'After.',
          updatedAt: '2026-01-01T00:00:00.000Z',
        }),
      ],
      'Click Next.',
      'ru',
      'en',
      {
        punctuationMode: 'strict',
        contextBefore: 'Before.',
        contextAfter: 'After.',
      },
    )
    expect(match?.kind).toBe('context')
    expect(match?.target).toBe('Right.')
    expect(match?.score).toBe(1.01)
  })
})
