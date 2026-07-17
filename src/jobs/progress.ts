import type { SegmentStatus } from '@/types/project'

type ProgressSegment = {
  status: SegmentStatus
}

export function computeProgress(segments: readonly ProgressSegment[]) {
  return {
    done: segments.filter(segment => segment.status === 'done').length,
    total: segments.length,
  }
}
