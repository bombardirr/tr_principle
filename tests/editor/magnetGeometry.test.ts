import { describe, expect, it } from 'vitest'
import {
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
  it('falls back to idle (first-segment) anchor when nothing engaged', () => {
    expect(pickMagnetRowId({ activeId: null, hoverId: null, viewportAnchorId: 'c' })).toBe('c')
  })
  it('returns null when nothing set', () => {
    expect(pickMagnetRowId({ activeId: null, hoverId: null })).toBe(null)
  })
})
