import { reactive, ref } from 'vue'
import type { Segment, SegmentStatus, TargetStyleRange } from '@/types/project'

export type SegmentSnapshot = {
  target: string
  status: SegmentStatus
  targetStyles?: TargetStyleRange[]
}

const MAX_STEPS = 30
const COALESCE_MS = 1500

type Lane = {
  stack: SegmentSnapshot[]
  index: number
  lastCommitAt: number
  /** Tip grew from a typing burst — next coalesce may replace tip. */
  tipIsTyping: boolean
}

function cloneTargetStyles(
  styles: TargetStyleRange[] | undefined,
): TargetStyleRange[] | undefined {
  if (!styles?.length) return undefined
  return styles.map((r) => ({ ...r }))
}

function snapshotOf(
  seg: Pick<Segment, 'target' | 'status' | 'targetStyles'>,
): SegmentSnapshot {
  const targetStyles = cloneTargetStyles(seg.targetStyles)
  return {
    target: seg.target,
    status: seg.status,
    ...(targetStyles ? { targetStyles } : {}),
  }
}

function stylesEqual(
  a: TargetStyleRange[] | undefined,
  b: TargetStyleRange[] | undefined,
): boolean {
  if (!a?.length && !b?.length) return true
  if (!a?.length || !b?.length || a.length !== b.length) return false
  return a.every((r, i) => {
    const o = b[i]!
    return (
      r.start === o.start &&
      r.end === o.end &&
      r.bold === o.bold &&
      r.italic === o.italic &&
      r.underline === o.underline &&
      r.font === o.font &&
      r.fontSizePt === o.fontSizePt
    )
  })
}

function same(a: SegmentSnapshot, b: SegmentSnapshot): boolean {
  return (
    a.target === b.target &&
    a.status === b.status &&
    stylesEqual(a.targetStyles, b.targetStyles)
  )
}

/**
 * Per-segment undo/redo in RAM only (tab session, ~30 steps).
 * Tip = stack[length-1]. After undo, redoCount = tipIndex - index.
 * Typing within COALESCE_MS updates tip in place (one undo step per burst).
 */
export function useSegmentHistory() {
  const lanes = reactive(new Map<string, Lane>())
  const rev = ref(0)

  function bump() {
    rev.value += 1
  }

  function lane(segId: string): Lane {
    let L = lanes.get(segId)
    if (!L) {
      L = { stack: [], index: -1, lastCommitAt: 0, tipIsTyping: false }
      lanes.set(segId, L)
    }
    return L
  }

  function seed(seg: Pick<Segment, 'id' | 'target' | 'status' | 'targetStyles'>) {
    const L = lane(seg.id)
    if (L.stack.length === 0) {
      L.stack.push(snapshotOf(seg))
      L.index = 0
      L.tipIsTyping = false
      bump()
    }
  }

  /**
   * Call after segment target/status changed (not after undo/redo restore).
   * @param coalesce — typing: replace tip within the idle window of a typing burst.
   */
  function commit(
    seg: Pick<Segment, 'id' | 'target' | 'status' | 'targetStyles'>,
    options?: { coalesce?: boolean },
  ) {
    const L = lane(seg.id)
    const snap = snapshotOf(seg)
    const now = Date.now()
    const coalesce = Boolean(options?.coalesce)

    if (L.stack.length === 0) {
      L.stack.push(snap)
      L.index = 0
      L.lastCommitAt = now
      L.tipIsTyping = coalesce
      bump()
      return
    }

    if (L.index < L.stack.length - 1) {
      L.stack = L.stack.slice(0, L.index + 1)
      L.tipIsTyping = false
    }

    const tip = L.stack[L.index]!
    if (same(tip, snap)) return

    const mergeTyping =
      coalesce &&
      L.tipIsTyping &&
      L.index === L.stack.length - 1 &&
      now - L.lastCommitAt < COALESCE_MS &&
      L.stack.length >= 2

    if (mergeTyping) {
      L.stack[L.index] = snap
      L.lastCommitAt = now
      bump()
      return
    }

    L.stack.push(snap)
    if (L.stack.length > MAX_STEPS) {
      const drop = L.stack.length - MAX_STEPS
      L.stack.splice(0, drop)
    }
    L.index = L.stack.length - 1
    L.lastCommitAt = now
    L.tipIsTyping = coalesce
    bump()
  }

  function canUndo(segId: string): boolean {
    void rev.value
    const L = lanes.get(segId)
    return Boolean(L && L.index > 0)
  }

  function canRedo(segId: string): boolean {
    void rev.value
    const L = lanes.get(segId)
    return Boolean(L && L.index >= 0 && L.index < L.stack.length - 1)
  }

  function redoCount(segId: string): number {
    void rev.value
    const L = lanes.get(segId)
    if (!L || L.index < 0) return 0
    return Math.max(0, L.stack.length - 1 - L.index)
  }

  function undo(segId: string): SegmentSnapshot | null {
    const L = lanes.get(segId)
    if (!L || L.index <= 0) return null
    L.index -= 1
    L.tipIsTyping = false
    bump()
    return L.stack[L.index] ?? null
  }

  function redo(segId: string): SegmentSnapshot | null {
    const L = lanes.get(segId)
    if (!L || L.index >= L.stack.length - 1) return null
    L.index += 1
    L.tipIsTyping = false
    bump()
    return L.stack[L.index] ?? null
  }

  return { seed, commit, canUndo, canRedo, redoCount, undo, redo, rev }
}
