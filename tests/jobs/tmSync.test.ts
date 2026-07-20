import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { JobResource } from '@/types/job'
import type { TmUnit } from '@/types/tm'

const listJobResources = vi.fn()
const pullJobTmSync = vi.fn()
const pushJobTmSync = vi.fn()
const getJobTmUnit = vi.fn()
const putJobTmUnit = vi.fn()
const removeJobTmUnit = vi.fn()

vi.mock('@/jobs/tmApi', () => ({
  listJobResources,
  pullJobTmSync,
  pushJobTmSync,
}))

vi.mock('@/storage/jobTmIdb', () => ({
  getJobTmUnit,
  putJobTmUnit,
  removeJobTmUnit,
}))

vi.mock('@/storage/scope', () => ({
  getStorageAccountId: () => 'account-1',
  onStorageAccountChange: () => () => {},
}))

const resource: JobResource = {
  kind: 'job_tm',
  enabled: true,
  canRead: true,
  canWrite: false,
  canExport: false,
  canClone: false,
  preset: {
    canRead: true,
    canWrite: false,
    canExport: false,
    canClone: false,
  },
}

const writableResource: JobResource = {
  ...resource,
  canWrite: true,
  preset: {
    ...resource.preset,
    canWrite: true,
  },
}

describe('job TM resource cache', () => {
  beforeEach(() => {
    localStorage.clear()
    listJobResources.mockReset()
    vi.resetModules()
  })

  it('returns the cached resource when loading resources fails', async () => {
    const { cacheJobResource } = await import('@/jobs/resources')
    cacheJobResource('job-1', resource)
    listJobResources.mockRejectedValueOnce(new Error('offline'))

    const { loadJobResource } = await import('@/jobs/resources')

    await expect(loadJobResource('job-1')).resolves.toEqual(resource)
  })

  it('caches the job TM resource returned by the network', async () => {
    listJobResources.mockResolvedValueOnce([resource])
    const { loadJobResource, readCachedJobResource } = await import('@/jobs/resources')

    await expect(loadJobResource('job-1')).resolves.toEqual(resource)
    expect(readCachedJobResource('job-1')).toEqual(resource)
  })
})

const unit: TmUnit = {
  id: 'unit-1',
  source: 'Source',
  target: 'Target',
  sourceKey: 'source',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
}

describe('job TM sync', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetModules()
    pullJobTmSync.mockReset()
    pushJobTmSync.mockReset()
    getJobTmUnit.mockReset()
    putJobTmUnit.mockReset()
    removeJobTmUnit.mockReset()
  })

  it('pushes a locally dirty unit for its job', async () => {
    getJobTmUnit.mockResolvedValueOnce(unit)
    const { cacheJobResource } = await import('@/jobs/resources')
    const { markJobTmDirty, syncJobTm } = await import('@/jobs/tmSync')

    cacheJobResource('job-1', writableResource)
    markJobTmDirty('job-1', unit.id)
    await syncJobTm('job-1', { pushOnly: true })

    expect(pushJobTmSync).toHaveBeenCalledWith('job-1', [unit])
    expect(localStorage.getItem('appzac-job-tm-sync-dirty:account-1:job-1')).toBe('[]')
  })

  it('stores a newer remote unit and advances its sync cursor', async () => {
    pullJobTmSync.mockResolvedValueOnce({
      units: [unit],
      until: '2026-01-03T00:00:00.000Z',
      hasMore: false,
    })
    getJobTmUnit.mockResolvedValueOnce(undefined)
    const { syncJobTm } = await import('@/jobs/tmSync')

    await syncJobTm('job-1')

    expect(putJobTmUnit).toHaveBeenCalledWith('job-1', {
      ...unit,
      deletedAt: null,
    })
    expect(localStorage.getItem('appzac-job-tm-sync-since:account-1:job-1')).toBe(
      '2026-01-03T00:00:00.000Z'
    )
  })

  it('does not push dirty units for a read-only resource', async () => {
    const { cacheJobResource } = await import('@/jobs/resources')
    const { markJobTmDirty, syncJobTm } = await import('@/jobs/tmSync')

    cacheJobResource('job-1', resource)
    getJobTmUnit.mockResolvedValueOnce(unit)
    markJobTmDirty('job-1', unit.id)
    await syncJobTm('job-1', { pushOnly: true })

    expect(pushJobTmSync).not.toHaveBeenCalled()
  })
})
