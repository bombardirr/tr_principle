import { describe, expect, it } from 'vitest'
import { normalizeTmSource, tmLookupKey } from '@/tm/normalize'

describe('tm normalize', () => {
  it('strips tags and collapses whitespace', () => {
    expect(normalizeTmSource('{1}Hello {2}{3}world{4}')).toBe('hello world')
  })

  it('builds lookup key with langs', () => {
    expect(tmLookupKey('Hello', 'en', 'ru')).toBe('hello::en|ru')
  })
})
