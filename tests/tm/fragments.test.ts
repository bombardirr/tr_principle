import { describe, expect, it } from 'vitest'
import { splitTmFragments } from '@/tm/fragments'

describe('tm fragments', () => {
  it('splits on sentence boundaries', () => {
    expect(
      splitTmFragments('Вы нам нравитесь. Вы нам реально нравитесь. Вы нам нравитесь?'),
    ).toEqual([
      'Вы нам нравитесь.',
      'Вы нам реально нравитесь.',
      'Вы нам нравитесь?',
    ])
  })

  it('returns single fragment for one sentence', () => {
    expect(splitTmFragments('Вы нам нравитесь.')).toEqual(['Вы нам нравитесь.'])
  })
})
