import { describe, expect, it } from 'vitest'
import { PERSONAL_TM_ATTACHMENT_ID } from '../../src/tm/projectAttachments'
import {
  sharedExactHitsFromMatches,
  shouldWarnSharedExact,
} from '../../src/tm/shouldWarnSharedExact'
import type { TmMatch, TmUnit } from '../../src/types/tm'

describe('shouldWarnSharedExact', () => {
  it('warns on exact hit authored by someone else', () => {
    expect(
      shouldWarnSharedExact(
        [{ kind: 'exact', updatedBy: 'Ivan', baseId: 'share:u1:base' }],
        'Me',
      ),
    ).toBe(true)
  })

  it('warns on context hit authored by someone else', () => {
    expect(
      shouldWarnSharedExact(
        [{ kind: 'context', createdBy: 'Ivan', baseId: 'named-base' }],
        'Me',
      ),
    ).toBe(true)
  })

  it('does not warn when author is current actor', () => {
    expect(
      shouldWarnSharedExact(
        [{ kind: 'exact', updatedBy: 'Me', baseId: 'share:u1:base' }],
        'Me',
      ),
    ).toBe(false)
  })

  it('does not warn for personal TM hits', () => {
    expect(
      shouldWarnSharedExact(
        [{ kind: 'exact', updatedBy: 'Ivan', baseId: PERSONAL_TM_ATTACHMENT_ID }],
        'Me',
      ),
    ).toBe(false)
  })

  it('does not warn for fuzzy/fragment', () => {
    expect(
      shouldWarnSharedExact(
        [{ kind: 'fuzzy', updatedBy: 'Ivan', baseId: 'share:u1:base' }],
        'Me',
      ),
    ).toBe(false)
  })

  it('does not warn with empty actor', () => {
    expect(
      shouldWarnSharedExact(
        [{ kind: 'exact', updatedBy: 'Ivan', baseId: 'share:u1:base' }],
        '',
      ),
    ).toBe(false)
  })
})

describe('sharedExactHitsFromMatches', () => {
  it('keeps non-personal exact/context and drops personal/fuzzy', () => {
    const units: TmUnit[] = [
      {
        id: 'u1',
        baseId: 'share:o:b',
        source: 'a',
        target: 'b',
        sourceKey: 'k',
        createdAt: '',
        updatedAt: '',
        updatedBy: 'Ivan',
      },
      {
        id: 'u2',
        baseId: PERSONAL_TM_ATTACHMENT_ID,
        source: 'a',
        target: 'c',
        sourceKey: 'k',
        createdAt: '',
        updatedAt: '',
        updatedBy: 'Other',
      },
    ]
    const matches: TmMatch[] = [
      { target: 'b', kind: 'exact', score: 1, unitId: 'u1', updatedBy: 'Ivan' },
      { target: 'c', kind: 'exact', score: 1, unitId: 'u2', updatedBy: 'Other' },
      { target: 'd', kind: 'fuzzy', score: 0.9, unitId: 'u1', updatedBy: 'Ivan' },
    ]
    expect(sharedExactHitsFromMatches(matches, units)).toEqual([
      { kind: 'exact', createdBy: undefined, updatedBy: 'Ivan', baseId: 'share:o:b' },
    ])
  })
})
