import { describe, expect, it } from 'vitest'
import { computeTooltipPlacement } from '@/utils/tooltipPlacement'

const vp = { width: 400, height: 300 }

describe('computeTooltipPlacement', () => {
  it('prefers top when there is room', () => {
    const anchor = new DOMRect(100, 80, 40, 20)
    const result = computeTooltipPlacement(anchor, 120, 32, vp)
    expect(result.placement).toBe('top')
    expect(result.x).toBe(120)
    expect(result.y).toBe(80)
  })

  it('flips to bottom near the top edge', () => {
    const anchor = new DOMRect(100, 4, 40, 20)
    const result = computeTooltipPlacement(anchor, 120, 32, vp)
    expect(result.placement).toBe('bottom')
    expect(result.y).toBe(24)
  })

  it('clamps horizontal position near the right edge', () => {
    const anchor = new DOMRect(360, 120, 32, 20)
    const result = computeTooltipPlacement(anchor, 140, 32, vp)
    expect(result.placement).toBe('top')
    expect(result.x).toBe(322)
  })
})
