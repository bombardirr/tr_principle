import type { JobResource } from '@/types/job'
import type { TmUnit } from '@/types/tm'
import { listJobResources } from '@/jobs/tmApi'
import { getStorageAccountId, onStorageAccountChange } from '@/storage/scope'

const RESOURCE_CACHE_BASE = 'appzac-job-resource'
const resourceCache = new Map<string, JobResource | null>()

onStorageAccountChange(() => resourceCache.clear())

function resourceCacheKey(jobId: string): string {
  return `${RESOURCE_CACHE_BASE}:${getStorageAccountId() ?? 'anonymous'}:${jobId}`
}

export function cacheJobResource(jobId: string, resource: JobResource | null): void {
  resourceCache.set(jobId, resource)
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(resourceCacheKey(jobId), JSON.stringify(resource))
}

export function readCachedJobResource(jobId: string): JobResource | null {
  if (resourceCache.has(jobId)) return resourceCache.get(jobId) ?? null
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(resourceCacheKey(jobId))
    if (!raw) return null
    const resource = JSON.parse(raw) as JobResource | null
    resourceCache.set(jobId, resource)
    return resource
  } catch {
    return null
  }
}

export async function loadJobResource(jobId: string): Promise<JobResource | null> {
  try {
    const list = await listJobResources(jobId)
    const resource = list.find(item => item.kind === 'job_tm') ?? null
    cacheJobResource(jobId, resource)
    return resource
  } catch {
    return readCachedJobResource(jobId)
  }
}

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
