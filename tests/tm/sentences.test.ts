import { describe, expect, it } from 'vitest'
import { splitTaggedSentences, joinSentenceTargets } from '@/tm/sentences'

describe('splitTaggedSentences', () => {
  it('splits plain multi-sentence text', () => {
    expect(splitTaggedSentences('Я Артём. Я Артём?')).toEqual(['Я Артём.', 'Я Артём?'])
  })

  it('keeps single sentence intact', () => {
    expect(splitTaggedSentences('Hello world.')).toEqual(['Hello world.'])
  })

  it('keeps tags with their sentence', () => {
    const parts = splitTaggedSentences('{1}Я Артём.{2} Я Артём?')
    expect(parts.length).toBe(2)
    expect(parts[0]).toContain('Я Артём.')
    expect(parts[1]).toContain('Я Артём?')
  })
})

describe('joinSentenceTargets', () => {
  it('joins with spaces and keeps punctuation tight', () => {
    expect(joinSentenceTargets(['I am Artem.', 'Am I Artem?'])).toBe(
      'I am Artem. Am I Artem?',
    )
  })
})
