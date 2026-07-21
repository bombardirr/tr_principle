import { describe, expect, it } from 'vitest'
import { exportTmx, parseTmx } from '@/tm/tmx'
import type { TmUnit } from '@/types/tm'

const sample: TmUnit[] = [
  {
    id: '1',
    baseId: 'personal-tm',
    source: 'Hello',
    target: 'Привет',
    sourceKey: 'hello::en|ru',
    sourceLang: 'en',
    targetLang: 'ru',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
]

describe('tmx', () => {
  it('roundtrips units', () => {
    const xml = exportTmx(sample, { sourceLang: 'en', targetLang: 'ru' })
    const parsed = parseTmx(xml)
    expect(parsed).toHaveLength(1)
    expect(parsed[0]?.source).toBe('Hello')
    expect(parsed[0]?.target).toBe('Привет')
    expect(parsed[0]?.sourceLang).toBe('en')
    expect(parsed[0]?.targetLang).toBe('ru')
  })
})
