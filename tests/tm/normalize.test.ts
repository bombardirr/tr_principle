import { describe, expect, it } from 'vitest'
import { normalizeTmForMatch, normalizeTmSource, tmLookupKey } from '@/tm/normalize'

describe('tm normalize for match', () => {
  it('strips tags and collapses whitespace', () => {
    expect(normalizeTmSource('{1}Hello {2}{3}world{4}')).toBe('hello world')
  })

  it('builds lookup key with langs', () => {
    expect(tmLookupKey('Hello', 'en', 'ru')).toBe('hello::en|ru')
  })

  it('soft mode ignores trailing punctuation', () => {
    expect(normalizeTmForMatch('Вы нам нравитесь.', 'soft')).toBe('вы нам нравитесь')
    expect(normalizeTmForMatch('Вы нам нравитесь?', 'soft')).toBe('вы нам нравитесь')
    expect(normalizeTmForMatch('Вы нам нравитесь', 'soft')).toBe('вы нам нравитесь')
  })

  it('strict mode keeps trailing punctuation', () => {
    expect(normalizeTmForMatch('Вы нам нравитесь.', 'strict')).toBe('вы нам нравитесь.')
    expect(normalizeTmForMatch('Вы нам нравитесь', 'strict')).toBe('вы нам нравитесь')
  })
})
