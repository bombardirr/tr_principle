import { tmLookupKey } from '@/tm/normalize'
import type { SegmentStatus } from '@/types/project'
import type { TmUnit } from '@/types/tm'

type ProgressSegment = {
  status: SegmentStatus
  source?: string
}

export function computeProgress(segments: readonly ProgressSegment[]) {
  return {
    done: segments.filter(segment => segment.status === 'done').length,
    total: segments.length,
  }
}

/** Exact TM hits among segments (same total as project size). */
export function computeTmCoverage(
  segments: readonly ProgressSegment[],
  units: readonly TmUnit[],
  sourceLang?: string,
  targetLang?: string,
) {
  const keys = new Set<string>()
  for (const unit of units) {
    if (unit.deletedAt) continue
    if (sourceLang && unit.sourceLang && unit.sourceLang !== sourceLang) continue
    if (targetLang && unit.targetLang && unit.targetLang !== targetLang) continue
    keys.add(unit.sourceKey || tmLookupKey(unit.source, unit.sourceLang, unit.targetLang))
  }

  let tmHits = 0
  for (const segment of segments) {
    const source = segment.source?.trim() ?? ''
    if (!source) continue
    const key = tmLookupKey(source, sourceLang, targetLang)
    if (keys.has(key)) tmHits += 1
  }

  return {
    tmHits,
    total: segments.length,
  }
}

export function progressPercent(done: number, total: number) {
  if (total <= 0) return 0
  return Math.min(100, Math.round((done / total) * 100))
}
