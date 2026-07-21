import type { Segment } from '@/types/project'
import type { TmUnit } from '@/types/tm'
import { tmLookupKey } from '@/tm/normalize'
import { isSegmentDone } from '@/utils/segmentStatus'
import { PERSONAL_TM_ATTACHMENT_ID } from '@/tm/projectAttachments'

export type TmUnitFromSegmentOptions = {
  sourceLang?: string
  targetLang?: string
  projectId?: string
  actor?: string
  /** TM base this unit belongs to (defaults to personal-tm). */
  baseId?: string
  contextBefore?: string
  contextAfter?: string
}

/** Creates a TM row for a completed, non-empty segment. */
export async function buildTmUnitFromSegment(
  segment: Segment,
  options?: TmUnitFromSegmentOptions,
  existing: TmUnit[] = [],
): Promise<TmUnit | null> {
  if (!isSegmentDone(segment) || !segment.target.trim()) return null

  const sourceKey = tmLookupKey(
    segment.source,
    options?.sourceLang,
    options?.targetLang,
  )
  if (!sourceKey.split('::')[0]) return null

  const prev = existing
    .filter((unit) => !unit.deletedAt)
    .find((unit) => unit.target === segment.target)
  const now = new Date().toISOString()
  const actor = options?.actor ?? 'local'

  return {
    id: prev?.id ?? crypto.randomUUID(),
    baseId: options?.baseId ?? prev?.baseId ?? PERSONAL_TM_ATTACHMENT_ID,
    source: segment.source,
    target: segment.target,
    sourceKey,
    sourceLang: options?.sourceLang,
    targetLang: options?.targetLang,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
    deletedAt: null,
    projectId: options?.projectId,
    createdBy: prev?.createdBy ?? actor,
    updatedBy: actor,
    contextBefore: options?.contextBefore ?? prev?.contextBefore,
    contextAfter: options?.contextAfter ?? prev?.contextAfter,
  }
}
