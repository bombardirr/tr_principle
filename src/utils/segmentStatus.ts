import type { Segment } from '@/types/project'

export function isSegmentDone(segment: Segment): boolean {
  return segment.status === 'done'
}

/** Segment has a translation (including draft while typing). */
export function isSegmentTranslated(segment: Segment): boolean {
  return isSegmentDone(segment) || segment.target.trim() !== ''
}

export function countDoneSegments(segments: Segment[]): number {
  return segments.filter(isSegmentDone).length
}

export function countTranslatedSegments(segments: Segment[]): number {
  return segments.filter(isSegmentTranslated).length
}

export function normalizeSegmentStatus(segment: Segment): Segment['status'] {
  if (segment.status === 'done') return 'done'
  return segment.target.trim() ? 'done' : 'empty'
}

export function finalizeSegmentStatus(segment: Segment): Segment['status'] {
  if (segment.status === 'done') return 'done'
  if (segment.status === 'draft') {
    return segment.target.trim() ? 'done' : 'empty'
  }
  return segment.target.trim() ? 'done' : 'empty'
}

export function isIntentionallyEmpty(segment: Segment): boolean {
  return segment.status === 'done' && segment.target.trim() === ''
}
