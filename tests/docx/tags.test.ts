import { describe, expect, it } from 'vitest'
import {
  buildTaggedText,
  splitTaggedText,
  tagMismatchPenalty,
  tagsMatch,
} from '../../src/docx/tags'

describe('tags', () => {
  it('leaves single span untagged', () => {
    expect(buildTaggedText(['Hello'])).toBe('Hello')
  })

  it('wraps multiple spans', () => {
    expect(buildTaggedText(['Hello ', 'world'])).toBe('{1}Hello {2}{3}world{4}')
  })

  it('validates matching tags', () => {
    const source = '{1}A{2}{3}B{4}'
    expect(tagsMatch(source, '{1}X{2}{3}Y{4}')).toBe(true)
    expect(tagsMatch(source, '{1}X{2}')).toBe(false)
  })

  it('computes tag mismatch penalty', () => {
    expect(tagMismatchPenalty('Hello', 'Hello')).toBe(0)
    expect(tagMismatchPenalty('{1}Hello{2}', '{1}Hello{2}')).toBe(0)
    expect(tagMismatchPenalty('{1}Hello{2}', 'Hello')).toBe(0.15)
    expect(tagMismatchPenalty('{1}A{2}{3}B{4}', '{1}A{2}')).toBe(0.075)
  })

  it('splits tagged target into parts', () => {
    const source = '{1}Hello {2}{3}world{4}'
    expect(splitTaggedText(source, '{1}Привет {2}{3}мир{4}')).toEqual(['Привет ', 'мир'])
  })

  it('splits untagged as single part', () => {
    expect(splitTaggedText('Hello', 'Привет')).toEqual(['Привет'])
  })

  it('coerces missing tags into first span', async () => {
    const { coerceTargetTags } = await import('../../src/docx/tags')
    expect(coerceTargetTags('{1}Hello {2}{3}world{4}', 'Привет мир')).toBe(
      '{1}Привет мир{2}{3}{4}',
    )
  })
})
