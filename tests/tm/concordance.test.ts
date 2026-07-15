import { describe, expect, it } from 'vitest'
import { searchConcordance } from '@/tm/concordance'
import { tmLookupKey } from '@/tm/normalize'
import type { TmUnit } from '@/types/tm'

function unit(source: string, target: string, id = 'u1'): TmUnit {
  return {
    id,
    source,
    target,
    sourceKey: tmLookupKey(source, 'ru', 'en'),
    sourceLang: 'ru',
    targetLang: 'en',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('searchConcordance', () => {
  it('returns empty for short query', () => {
    expect(searchConcordance([unit('подпись ФИО', 'signature')], 'п')).toEqual([])
  })

  it('finds substring in source or target', () => {
    const units = [
      unit('подпись ФИО работника', "employee's signature", 'a'),
      unit('Дата', 'Date', 'b'),
      unit('Другое', 'signature block', 'c'),
    ]
    const hits = searchConcordance(units, 'подпис')
    expect(hits.map((h) => h.unitId)).toEqual(['a'])
    expect(hits[0]?.field).toBe('source')

    const byTarget = searchConcordance(units, 'signature')
    expect(byTarget.map((h) => h.unitId).sort()).toEqual(['a', 'c'])
  })

  it('prefers earlier match position then shorter source', () => {
    const hits = searchConcordance(
      [
        unit('xxx подпись yyy', 'A', 'long'),
        unit('подпись', 'B', 'short'),
      ],
      'подпись',
    )
    expect(hits[0]?.unitId).toBe('short')
  })
})
