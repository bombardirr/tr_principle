export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right'

const VIEWPORT_PAD = 8
const GAP = 6

type Viewport = { width: number; height: number }

type Box = { left: number; top: number; right: number; bottom: number }

function anchorPoint(anchor: DOMRect, placement: TooltipPlacement): { x: number; y: number } {
  const cx = anchor.left + anchor.width / 2
  const cy = anchor.top + anchor.height / 2
  switch (placement) {
    case 'top':
      return { x: cx, y: anchor.top }
    case 'bottom':
      return { x: cx, y: anchor.bottom }
    case 'left':
      return { x: anchor.left, y: cy }
    case 'right':
      return { x: anchor.right, y: cy }
  }
}

function tooltipBox(
  x: number,
  y: number,
  width: number,
  height: number,
  placement: TooltipPlacement,
): Box {
  switch (placement) {
    case 'top':
      return {
        left: x - width / 2,
        top: y - height - GAP,
        right: x + width / 2,
        bottom: y - GAP,
      }
    case 'bottom':
      return {
        left: x - width / 2,
        top: y + GAP,
        right: x + width / 2,
        bottom: y + GAP + height,
      }
    case 'left':
      return {
        left: x - width - GAP,
        top: y - height / 2,
        right: x - GAP,
        bottom: y + height / 2,
      }
    case 'right':
      return {
        left: x + GAP,
        top: y - height / 2,
        right: x + GAP + width,
        bottom: y + height / 2,
      }
  }
}

function fitsInViewport(box: Box, viewport: Viewport): boolean {
  return (
    box.left >= VIEWPORT_PAD &&
    box.top >= VIEWPORT_PAD &&
    box.right <= viewport.width - VIEWPORT_PAD &&
    box.bottom <= viewport.height - VIEWPORT_PAD
  )
}

function overflowAmount(box: Box, viewport: Viewport): number {
  return (
    Math.max(0, VIEWPORT_PAD - box.left) +
    Math.max(0, VIEWPORT_PAD - box.top) +
    Math.max(0, box.right - (viewport.width - VIEWPORT_PAD)) +
    Math.max(0, box.bottom - (viewport.height - VIEWPORT_PAD))
  )
}

function clampHorizontal(x: number, width: number, viewport: Viewport): number {
  const half = width / 2
  return Math.min(Math.max(x, VIEWPORT_PAD + half), viewport.width - VIEWPORT_PAD - half)
}

function clampVertical(y: number, height: number, viewport: Viewport): number {
  const half = height / 2
  return Math.min(Math.max(y, VIEWPORT_PAD + half), viewport.height - VIEWPORT_PAD - half)
}

function finalizePoint(
  point: { x: number; y: number },
  placement: TooltipPlacement,
  tipWidth: number,
  tipHeight: number,
  viewport: Viewport,
): { x: number; y: number } {
  if (placement === 'top' || placement === 'bottom') {
    return { x: clampHorizontal(point.x, tipWidth, viewport), y: point.y }
  }
  return { x: point.x, y: clampVertical(point.y, tipHeight, viewport) }
}

export function computeTooltipPlacement(
  anchor: DOMRect,
  tipWidth: number,
  tipHeight: number,
  viewport: Viewport = {
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
  },
): { x: number; y: number; placement: TooltipPlacement } {
  const order: TooltipPlacement[] = ['top', 'bottom', 'right', 'left']

  for (const placement of order) {
    const point = finalizePoint(anchorPoint(anchor, placement), placement, tipWidth, tipHeight, viewport)
    const box = tooltipBox(point.x, point.y, tipWidth, tipHeight, placement)
    if (fitsInViewport(box, viewport)) {
      return { ...point, placement }
    }
  }

  let best = {
    x: 0,
    y: 0,
    placement: 'bottom' as TooltipPlacement,
    overflow: Infinity,
  }

  for (const placement of order) {
    const point = finalizePoint(anchorPoint(anchor, placement), placement, tipWidth, tipHeight, viewport)
    const box = tooltipBox(point.x, point.y, tipWidth, tipHeight, placement)
    const overflow = overflowAmount(box, viewport)
    if (overflow < best.overflow) {
      best = { ...point, placement, overflow }
    }
  }

  return { x: best.x, y: best.y, placement: best.placement }
}

export function positionTooltipNearAnchor(
  anchor: HTMLElement,
  tipEl: HTMLElement,
): { x: number; y: number; placement: TooltipPlacement } {
  return computeTooltipPlacement(
    anchor.getBoundingClientRect(),
    tipEl.offsetWidth,
    tipEl.offsetHeight,
  )
}
