import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '@/auth/api'
import { createJobGlossaryAttachment } from '@/jobs/glossaryAttachmentsApi'
import { putGlossaryTerm } from '@/storage/glossaryIdb'
import { setStorageAccountId } from '@/storage/scope'
import { syncGlossaryBase } from '@/glossary/sync'

vi.mock('@/auth/api', () => ({
  apiFetch: vi.fn(),
}))

const mockApiFetch = vi.mocked(apiFetch)

describe('syncGlossaryBase', () => {
  beforeEach(() => {
    setStorageAccountId(null)
    localStorage.clear()
    mockApiFetch.mockReset()
    setStorageAccountId('user-1')
  })

  it('stores independent cursors for each base and job context', async () => {
    mockApiFetch.mockResolvedValue({
      until: '2026-07-22T12:00:00.000Z',
      terms: [],
      hasMore: false,
    })

    await syncGlossaryBase('base-a')
    await syncGlossaryBase('base-b', { jobId: 'job-1' })

    expect(localStorage.getItem('appzac-glossary-sync-since:user-1:base-a')).toBe(
      '2026-07-22T12:00:00.000Z',
    )
    expect(localStorage.getItem('appzac-glossary-sync-since:user-1:base-b:job-1')).toBe(
      '2026-07-22T12:00:00.000Z',
    )
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/glossary/bases/base-a/sync?since=1970-01-01T00%3A00%3A00.000Z',
    )
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/glossary/bases/base-b/sync?since=1970-01-01T00%3A00%3A00.000Z&jobId=job-1',
    )
  })

  it('promotes the cloud base and terms before posting its job attachment', async () => {
    const term = {
      id: 'term-1',
      baseId: 'base-promote',
      sourceLang: 'en',
      targetLang: 'de',
      sourceTerm: 'term',
      targetTerm: 'Begriff',
      status: 'approved' as const,
      caseSensitive: false,
      createdAt: '2026-07-22T12:00:00.000Z',
      updatedAt: '2026-07-22T12:00:00.000Z',
    }
    await putGlossaryTerm(term)
    localStorage.setItem('appzac-glossary-sync-dirty:user-1:base-promote', '["term-1"]')
    mockApiFetch.mockResolvedValue({ ok: true, until: term.updatedAt })

    await createJobGlossaryAttachment('job-1', { glossaryBaseId: 'base-promote' })

    expect(mockApiFetch).toHaveBeenNthCalledWith(1, '/api/glossary/bases', {
      method: 'POST',
      body: JSON.stringify({ id: 'base-promote', label: 'base-promote', color: '#5b9fd4' }),
    })
    expect(mockApiFetch).toHaveBeenNthCalledWith(2, '/api/glossary/bases/base-promote/sync', {
      method: 'POST',
      body: JSON.stringify({ terms: [term] }),
    })
    expect(mockApiFetch).toHaveBeenNthCalledWith(3, '/api/jobs/job-1/glossary-attachments', {
      method: 'POST',
      body: JSON.stringify({ glossaryBaseId: 'base-promote' }),
    })
  })
})
