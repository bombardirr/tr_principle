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

  it('does not drop closing markers after a short first sentence', () => {
    const tagged =
      '{1}Внимание!{2}{3} {4}{5}Общероссийские{6}{7} дни.{8}'
    const parts = splitTaggedSentences(tagged)
    expect(parts.length).toBe(2)
    // Space + following marker pairs stay with the first cut; the link run that
    // starts the next sentence keeps its own open marker.
    expect(parts[0]).toBe('{1}Внимание!{2}{3} {4}')
    expect(parts[1]).toBe('{5}Общероссийские{6}{7} дни.{8}')
    expect(joinSentenceTargets(parts)).toBe(tagged)
  })
})

describe('joinSentenceTargets', () => {
  it('joins with spaces and keeps punctuation tight', () => {
    expect(joinSentenceTargets(['I am Artem.', 'Am I Artem?'])).toBe(
      'I am Artem. Am I Artem?',
    )
  })

  it('does not insert a gap between abutting markers', () => {
    expect(joinSentenceTargets(['{1}Hi!{2}', '{3} Next.{4}'])).toBe(
      '{1}Hi!{2}{3} Next.{4}',
    )
  })
})
