import { describe, expect, it } from 'vitest'
import { mergeTmUnitsForMatch } from '@/jobs/resources'
import type { TmUnit } from '@/types/tm'

function u(id: string, source: string, target: string): TmUnit {
  return {
    id,
    source,
    target,
    sourceKey: source,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('mergeTmUnitsForMatch', () => {
  it('concatenates personal and job units', () => {
    const out = mergeTmUnitsForMatch([u('p', 'a', 'A')], [u('j', 'b', 'B')])
    expect(out.map((x) => x.id).sort()).toEqual(['j', 'p'])
  })

  it('skips deleted job units', () => {
    const out = mergeTmUnitsForMatch(
      [],
      [{ ...u('j', 'b', 'B'), deletedAt: '2026-01-02T00:00:00.000Z' }],
    )
    expect(out).toEqual([])
  })
})
