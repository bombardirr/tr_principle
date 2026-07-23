import { PERSONAL_TM_ATTACHMENT_ID } from '@/tm/projectAttachments'
import type { TmMatch, TmMatchKind, TmUnit } from '@/types/tm'

export type SharedExactHit = {
  kind: TmMatchKind | string
  createdBy?: string
  updatedBy?: string
  baseId?: string
}

/** Prefer last writer, then creator. */
export function hitAuthor(hit: Pick<SharedExactHit, 'createdBy' | 'updatedBy'>): string {
  return (hit.updatedBy || hit.createdBy || '').trim()
}

/**
 * Soft-warn before confirm when a shared (non-personal) TM already has an
 * exact/context hit authored by someone else.
 */
export function shouldWarnSharedExact(
  jobTmHits: SharedExactHit[],
  currentActor: string,
): boolean {
  const actor = currentActor.trim()
  if (!actor) return false
  return jobTmHits.some(hit => {
    if (hit.kind !== 'exact' && hit.kind !== 'context') return false
    if (hit.baseId === PERSONAL_TM_ATTACHMENT_ID) return false
    const author = hitAuthor(hit)
    return Boolean(author && author !== actor)
  })
}

/** Exact/context matches from non-personal bases (caller already scoped to job). */
export function sharedExactHitsFromMatches(
  matches: TmMatch[],
  units: TmUnit[],
): SharedExactHit[] {
  const byId = new Map(units.map(u => [u.id, u]))
  const out: SharedExactHit[] = []
  for (const match of matches) {
    if (match.kind !== 'exact' && match.kind !== 'context') continue
    const unit = match.unitId ? byId.get(match.unitId) : undefined
    const baseId = match.baseId ?? unit?.baseId
    if (!baseId || baseId === PERSONAL_TM_ATTACHMENT_ID) continue
    out.push({
      kind: match.kind,
      createdBy: match.createdBy ?? unit?.createdBy,
      updatedBy: match.updatedBy ?? unit?.updatedBy,
      baseId,
    })
  }
  return out
}
