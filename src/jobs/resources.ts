import type { JobResource } from '@/types/job'
import type { TmUnit } from '@/types/tm'

function isActive(unit: TmUnit): boolean {
  return !unit.deletedAt
}

export function mergeTmUnitsForMatch(personal: TmUnit[], job: TmUnit[]): TmUnit[] {
  return [...personal.filter(isActive), ...job.filter(isActive)]
}

export function jobTmReadable(resource: JobResource | null | undefined): boolean {
  return Boolean(resource?.enabled && resource.canRead)
}

export function jobTmWritable(resource: JobResource | null | undefined): boolean {
  return Boolean(resource?.enabled && resource.canWrite)
}
