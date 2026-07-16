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
 * Idle fallback (`viewportAnchorId`) is the first list segment — park at top, no viewport tracking.
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
