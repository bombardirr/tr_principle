import { describe, expect, it } from 'vitest'
import type { TmMatch } from '@/types/tm'
import { shouldWarnSharedExact } from '@/jobs/sharedExactWarn'

function hit(partial: Partial<TmMatch> & Pick<TmMatch, 'kind'>): TmMatch {
  return {
    target: 'Translation',
    score: partial.kind === 'context' ? 1.01 : 1,
    ...partial,
  }
}

describe('shouldWarnSharedExact', () => {
  it('warns on exact hit from another actor', () => {
    const hits = [hit({ kind: 'exact', createdBy: 'Teammate' })]
    expect(shouldWarnSharedExact(hits, 'Me')).toBe(true)
  })

  it('warns on context hit from another actor', () => {
    const hits = [hit({ kind: 'context', updatedBy: 'anon:other' })]
    expect(shouldWarnSharedExact(hits, 'anon:me')).toBe(true)
  })

  it('does not warn on own exact hit', () => {
    const hits = [hit({ kind: 'exact', updatedBy: 'Me', createdBy: 'Me' })]
    expect(shouldWarnSharedExact(hits, 'Me')).toBe(false)
  })

  it('does not warn on own anon hit', () => {
    const hits = [hit({ kind: 'exact', updatedBy: 'anon:abc' })]
    expect(shouldWarnSharedExact(hits, 'anon:abc')).toBe(false)
  })

  it('ignores fuzzy hits from other actors', () => {
    const hits = [hit({ kind: 'fuzzy', score: 0.9, createdBy: 'Teammate' })]
    expect(shouldWarnSharedExact(hits, 'Me')).toBe(false)
  })

  it('returns false when there are no hits', () => {
    expect(shouldWarnSharedExact([], 'Me')).toBe(false)
  })

  it('returns false when current actor is empty', () => {
    const hits = [hit({ kind: 'exact', createdBy: 'Teammate' })]
    expect(shouldWarnSharedExact(hits, '')).toBe(false)
  })

  it('prefers updatedBy over createdBy for attribution', () => {
    const hits = [hit({ kind: 'exact', createdBy: 'Me', updatedBy: 'Teammate' })]
    expect(shouldWarnSharedExact(hits, 'Me')).toBe(true)
  })

  it('does not warn when attribution is missing', () => {
    const hits = [hit({ kind: 'exact' })]
    expect(shouldWarnSharedExact(hits, 'Me')).toBe(false)
  })
})
