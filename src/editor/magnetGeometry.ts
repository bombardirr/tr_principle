// src/editor/magnetGeometry.ts
export function magnetClusterTranslateY(opts: {
  listTop: number
  rowCenterY: number
  clusterHeight: number
}): number {
  return opts.rowCenterY - opts.listTop - opts.clusterHeight / 2
}

/**
 * When a segment is active, hover of other rows is ignored (active locks the rail).
 * Hover is only used when nothing is active.
 * Viewport anchor is used when neither active nor hover (cold load / mouse outside).
 */
export function pickMagnetRowId(opts: {
  activeId: string | null | undefined
  hoverId: string | null | undefined
  viewportAnchorId?: string | null | undefined
}): string | null {
  if (opts.activeId) return opts.activeId
  if (opts.hoverId) return opts.hoverId
  if (opts.viewportAnchorId) return opts.viewportAnchorId
  return null
}

/**
 * First segment (in document order) whose row intersects the viewport.
 * Falls back to the first id if none intersect (e.g. tiny layout glitch).
 */
export function firstSegmentIdInViewport(
  ids: string[],
  getRect: (id: string) => { top: number; bottom: number } | null,
  viewport: { top: number; bottom: number } = { top: 0, bottom: typeof window !== 'undefined' ? window.innerHeight : 0 },
): string | null {
  if (!ids.length) return null
  const pad = 8
  for (const id of ids) {
    const r = getRect(id)
    if (!r) continue
    if (r.bottom > viewport.top + pad && r.top < viewport.bottom - pad) return id
  }
  return ids[0] ?? null
}
