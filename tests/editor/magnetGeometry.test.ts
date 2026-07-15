import { describe, expect, it } from 'vitest'
import {
  firstSegmentIdInViewport,
  magnetClusterTranslateY,
  pickMagnetRowId,
} from '@/editor/magnetGeometry'

describe('magnetClusterTranslateY', () => {
  it('aligns cluster center with row center relative to list top', () => {
    expect(
      magnetClusterTranslateY({ listTop: 100, rowCenterY: 300, clusterHeight: 40 }),
    ).toBe(180)
  })

  it('handles zero-size cluster', () => {
    expect(
      magnetClusterTranslateY({ listTop: 0, rowCenterY: 50, clusterHeight: 0 }),
    ).toBe(50)
  })
})

describe('pickMagnetRowId', () => {
  it('locks to active and ignores hover of other rows', () => {
    expect(pickMagnetRowId({ activeId: 'a', hoverId: 'b', viewportAnchorId: 'c' })).toBe('a')
    expect(pickMagnetRowId({ activeId: 'a', hoverId: null, viewportAnchorId: 'c' })).toBe('a')
  })
  it('falls back to hover when nothing is active', () => {
    expect(pickMagnetRowId({ activeId: null, hoverId: 'b', viewportAnchorId: 'c' })).toBe('b')
  })
  it('falls back to viewport anchor when idle', () => {
    expect(pickMagnetRowId({ activeId: null, hoverId: null, viewportAnchorId: 'c' })).toBe('c')
  })
  it('returns null when nothing set', () => {
    expect(pickMagnetRowId({ activeId: null, hoverId: null })).toBe(null)
  })
})

describe('firstSegmentIdInViewport', () => {
  const viewport = { top: 0, bottom: 800 }
  const rects: Record<string, { top: number; bottom: number }> = {
    a: { top: -200, bottom: -20 },
    b: { top: 100, bottom: 300 },
    c: { top: 500, bottom: 700 },
  }

  it('returns the first intersecting segment in order', () => {
    expect(
      firstSegmentIdInViewport(['a', 'b', 'c'], (id) => rects[id] ?? null, viewport),
    ).toBe('b')
  })

  it('falls back to first id when none intersect', () => {
    expect(
      firstSegmentIdInViewport(
        ['a', 'b'],
        () => ({ top: 900, bottom: 1000 }),
        viewport,
      ),
    ).toBe('a')
  })
})
