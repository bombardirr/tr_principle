import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getTmUnit, putTmUnit } from '@/storage/tmIdb'
import { createTmBase, getTmBase } from '@/storage/tmBasesIdb'
import { setStorageAccountId } from '@/storage/scope'
import type { TmUnit } from '@/types/tm'
import { markTmDirty, syncTm, syncTmBase } from '@/tm/sync'

const { apiFetch } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}))

vi.mock('@/auth/api', () => ({ apiFetch }))

const accountId = '00000000-0000-4000-8000-0000000000bb'

function unit(overrides: Partial<TmUnit> = {}): TmUnit {
  return {
    id: crypto.randomUUID(),
    baseId: 'named-1',
    source: 'Hello',
    target: 'Привет',
    sourceKey: 'hello::en::ru',
    createdAt: '2026-07-21T10:00:00.000Z',
    updatedAt: '2026-07-21T10:00:00.000Z',
    ...overrides,
  }
}

describe('per-base TM sync', () => {
  beforeEach(() => {
    localStorage.clear()
    setStorageAccountId(accountId)
    apiFetch.mockReset()
  })

  afterEach(() => {
    setStorageAccountId(null)
  })

  it('pushes a dirty unit through its base sync endpoint', async () => {
    const local = unit()
    await putTmUnit(local)
    apiFetch.mockResolvedValue({ ok: true, until: '2026-07-21T11:00:00.000Z' })

    await markTmDirty(local.id)
    await syncTmBase(local.baseId, { pushOnly: true })

    expect(apiFetch).toHaveBeenCalledWith('/api/tm/bases/named-1/sync', {
      method: 'POST',
      body: JSON.stringify({ units: [local] }),
    })
  })

  it('merges a newer remote unit with last-write-wins', async () => {
    const local = unit({ id: 'shared-unit', target: 'old' })
    const remote = unit({
      id: local.id,
      target: 'new',
      updatedAt: '2026-07-21T12:00:00.000Z',
    })
    await putTmUnit(local)
    apiFetch.mockResolvedValue({
      until: '2026-07-21T12:00:01.000Z',
      units: [remote],
      hasMore: false,
    })

    await syncTmBase('named-1')

    expect(await getTmUnit(local.id)).toMatchObject({
      id: remote.id,
      baseId: remote.baseId,
      target: remote.target,
      updatedAt: remote.updatedAt,
    })
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/tm/bases/named-1/sync?since=1970-01-01T00%3A00%3A00.000Z',
    )
  })

  it('syncs the owned cloud catalog locally and pulls every owned base', async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path === '/api/tm/bases') {
        return {
          bases: [{
            id: 'cloud-base',
            label: 'Cloud base',
            color: '#123456',
            createdAt: '2026-07-21T09:00:00.000Z',
            updatedAt: '2026-07-21T09:00:00.000Z',
          }],
        }
      }
      return { until: '2026-07-21T13:00:00.000Z', units: [], hasMore: false }
    })

    await syncTm()

    expect(await getTmBase('cloud-base')).toMatchObject({
      label: 'Cloud base',
      color: '#123456',
    })
    expect(apiFetch).toHaveBeenCalledWith(
      '/api/tm/bases/cloud-base/sync?since=1970-01-01T00%3A00%3A00.000Z',
    )
  })

  it('posts a newly created local base to the cloud catalog', async () => {
    apiFetch.mockResolvedValue({ id: 'new-base', label: 'New base', color: '#5b9fd4' })

    await createTmBase({ id: 'new-base', label: 'New base' })

    expect(apiFetch).toHaveBeenCalledWith('/api/tm/bases', {
      method: 'POST',
      body: expect.any(String),
    })
    expect(JSON.parse(apiFetch.mock.calls[0]![1].body)).toMatchObject({
      id: 'new-base',
      label: 'New base',
    })
  })
})
