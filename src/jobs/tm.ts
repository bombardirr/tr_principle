import { pullJobTm } from '@/jobs/api'
import type { TmUnit } from '@/types/tm'

const EPOCH = '1970-01-01T00:00:00.000Z'

function translationKey(unit: TmUnit) {
  return [
    unit.sourceKey,
    unit.target,
    unit.contextBefore ?? '',
    unit.contextAfter ?? '',
  ].join('\u0000')
}

export function mergeTmSources(personal: TmUnit[], job: TmUnit[]): TmUnit[] {
  const merged = new Map<string, TmUnit>()
  for (const unit of [...personal, ...job]) {
    if (!unit.deletedAt) merged.set(translationKey(unit), unit)
  }
  return [...merged.values()]
}

export async function pullAllJobTm(jobId: string): Promise<TmUnit[]> {
  const units: TmUnit[] = []
  let since = EPOCH
  for (let page = 0; page < 50; page++) {
    const response = await pullJobTm(jobId, since)
    units.push(...response.units.filter(unit => !unit.deletedAt))
    if (!response.hasMore || !response.units.length) break
    since = response.units[response.units.length - 1]!.updatedAt
  }
  return units
}
