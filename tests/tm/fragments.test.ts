import { describe, expect, it } from 'vitest'
import { isCompositeSegment, splitTmFragments } from '@/tm/fragments'

describe('tm fragments', () => {
  it('splits on sentence boundaries with spaces', () => {
    expect(
      splitTmFragments('Вы нам нравитесь. Вы нам реально нравитесь. Вы нам нравитесь?'),
    ).toEqual([
      'Вы нам нравитесь.',
      'Вы нам реально нравитесь.',
      'Вы нам нравитесь?',
    ])
  })

  it('splits when there is no space after a period', () => {
    expect(splitTmFragments('Вы нам нравитесь.Вы нам реально нравитесь.')).toEqual([
      'Вы нам нравитесь.',
      'Вы нам реально нравитесь.',
    ])
  })

  it('returns single fragment for one sentence', () => {
    expect(splitTmFragments('Вы нам нравитесь.')).toEqual(['Вы нам нравитесь.'])
  })

  it('keeps trailing sentence without punctuation as its own fragment', () => {
    expect(
      splitTmFragments('Вы нам нравитесь. Вы нам реально нравитесь. Вы нам нравитесь'),
    ).toEqual([
      'Вы нам нравитесь.',
      'Вы нам реально нравитесь.',
      'Вы нам нравитесь',
    ])
  })

  it('detects composite segments', () => {
    expect(isCompositeSegment('One sentence.')).toBe(false)
    expect(isCompositeSegment('First. Second')).toBe(true)
  })
})
