import { describe, expect, it } from 'vitest'
import { computeProgress } from '@/jobs/progress'

describe('computeProgress', () => {
  it('counts only completed segments as done', () => {
    expect(
      computeProgress([
        { status: 'done' },
        { status: 'draft' },
        { status: 'empty' },
        { status: 'done' },
      ])
    ).toEqual({ done: 2, total: 4 })
  })

  it('reports zero progress for an empty project', () => {
    expect(computeProgress([])).toEqual({ done: 0, total: 0 })
  })
})
