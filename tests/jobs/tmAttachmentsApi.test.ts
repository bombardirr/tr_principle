import { beforeEach, describe, expect, it, vi } from 'vitest'

const { syncTmBase } = vi.hoisted(() => ({
  syncTmBase: vi.fn(),
}))

vi.mock('../../src/tm/sync', () => ({ syncTmBase }))

import {
  createJobTmAttachment,
  deleteJobTmAttachment,
  listJobTmAttachmentsApi,
  patchJobTmAttachment,
} from '../../src/jobs/tmAttachmentsApi'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

beforeEach(() => {
  fetchMock.mockReset()
  syncTmBase.mockReset()
  syncTmBase.mockResolvedValue(undefined)
  localStorage.setItem('appzac-auth-token', 'tok')
})

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('tmAttachmentsApi', () => {
  it('lists attachments', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        attachments: [
          {
            id: 'a1',
            jobId: 'j1',
            tmBaseId: 'personal-tm',
            canRead: true,
            canWrite: false,
            canExport: false,
            canClone: false,
            createdBy: 'u1',
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
      }),
    )
    const items = await listJobTmAttachmentsApi('j1')
    expect(items).toHaveLength(1)
    expect(items[0]!.tmBaseId).toBe('personal-tm')
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/jobs/j1/tm-attachments')
  })

  it('creates attachment', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, {
        id: 'a1',
        jobId: 'j1',
        tmBaseId: 'personal-tm',
        canRead: true,
        canWrite: true,
        canExport: false,
        canClone: false,
        createdBy: 'u1',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }),
    )
    const item = await createJobTmAttachment('j1', { tmBaseId: 'personal-tm', canWrite: true })
    expect(item.id).toBe('a1')
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'POST' })
    expect(syncTmBase).toHaveBeenCalledWith('personal-tm', { pushOnly: true })
  })

  it('patches and deletes', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          id: 'a1',
          jobId: 'j1',
          tmBaseId: 'personal-tm',
          canRead: true,
          canWrite: false,
          canExport: false,
          canClone: false,
          createdBy: 'u1',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    await patchJobTmAttachment('j1', 'a1', { canWrite: false })
    await deleteJobTmAttachment('j1', 'a1')
    expect(fetchMock.mock.calls[1]![1]).toMatchObject({ method: 'DELETE' })
  })
})
