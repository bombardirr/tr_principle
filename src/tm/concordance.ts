import type { TmUnit } from '@/types/tm'
import { normalizeTmSource } from './normalize'

export type ConcordanceHit = {
  unitId: string
  source: string
  target: string
  /** Where the query matched. */
  field: 'source' | 'target' | 'both'
  updatedAt?: string
  createdBy?: string
  updatedBy?: string
}

export const CONCORDANCE_MIN_QUERY = 2
export const CONCORDANCE_DEFAULT_LIMIT = 40

export function searchConcordance(
  units: TmUnit[],
  query: string,
  options?: { limit?: number },
): ConcordanceHit[] {
  const q = normalizeTmSource(query)
  if (q.length < CONCORDANCE_MIN_QUERY) return []

  const limit = options?.limit ?? CONCORDANCE_DEFAULT_LIMIT
  const hits: ConcordanceHit[] = []

  for (const unit of units) {
    if (unit.deletedAt) continue
    const src = normalizeTmSource(unit.source)
    const tgt = normalizeTmSource(unit.target)
    const inSource = src.includes(q)
    const inTarget = tgt.includes(q)
    if (!inSource && !inTarget) continue

    hits.push({
      unitId: unit.id,
      source: unit.source,
      target: unit.target,
      field: inSource && inTarget ? 'both' : inSource ? 'source' : 'target',
      updatedAt: unit.updatedAt,
      createdBy: unit.createdBy,
      updatedBy: unit.updatedBy,
    })
  }

  hits.sort((a, b) => {
    const aSrc = normalizeTmSource(a.source)
    const bSrc = normalizeTmSource(b.source)
    const aPos = aSrc.includes(q) ? aSrc.indexOf(q) : 9999
    const bPos = bSrc.includes(q) ? bSrc.indexOf(q) : 9999
    if (aPos !== bPos) return aPos - bPos
    if (aSrc.length !== bSrc.length) return aSrc.length - bSrc.length
    return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
  })

  return hits.slice(0, limit)
}
