import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TmUnit } from '@/types/tm'

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }))

vi.mock('@/auth/api', () => ({ apiFetch }))

import { pullJobTm, pushJobTm } from '@/jobs/api'
import { mergeTmSources } from '@/jobs/tm'

const personal: TmUnit = {
  id: 'personal-1',
  source: 'Hello',
  target: 'Привет',
  sourceKey: 'hello::en::ru',
  sourceLang: 'en',
  targetLang: 'ru',
  createdAt: '2026-07-17T10:00:00.000Z',
  updatedAt: '2026-07-17T10:00:00.000Z',
  createdBy: 'Me',
}

describe('job TM client', () => {
  beforeEach(() => {
    apiFetch.mockReset()
  })

  it('uses the job-scoped sync routes', async () => {
    apiFetch.mockResolvedValue({ until: 'now', units: [], hasMore: false })

    await pullJobTm('job 1', '1970-01-01T00:00:00.000Z')
    await pushJobTm('job 1', [personal])

    expect(apiFetch).toHaveBeenNthCalledWith(
      1,
      '/api/jobs/job%201/tm/sync?since=1970-01-01T00%3A00%3A00.000Z',
    )
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/jobs/job%201/tm/sync', {
      method: 'POST',
      body: JSON.stringify({ units: [personal] }),
    })
  })
})

describe('mergeTmSources', () => {
  it('adds job units without duplicating the same translation', () => {
    const jobCopy = {
      ...personal,
      id: 'job-1',
      updatedAt: '2026-07-17T11:00:00.000Z',
      updatedBy: 'Teammate',
    }
    const jobOnly = {
      ...personal,
      id: 'job-2',
      source: 'World',
      target: 'Мир',
      sourceKey: 'world::en::ru',
    }

    expect(mergeTmSources([personal], [jobCopy, jobOnly])).toEqual([jobCopy, jobOnly])
  })
})
