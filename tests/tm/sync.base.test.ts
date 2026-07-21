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

    markTmDirty(local.id)
    await syncTmBase(local.baseId, { pushOnly: true })

    expect(apiFetch).toHaveBeenCalledWith('/api/tm/bases/named-1/sync', {
      method: 'POST',
      body: JSON.stringify({ units: [local] }),
    })
  })

  it('serializes syncTm and syncTmBase so stale pushes cannot drop newer dirty ids', async () => {
    const first = unit({ id: 'first-unit' })
    const second = unit({ id: 'second-unit' })
    await Promise.all([putTmUnit(first), putTmUnit(second)])
    let releaseFirstPush!: () => void
    const firstPush = new Promise<void>((resolve) => {
      releaseFirstPush = resolve
    })
    apiFetch.mockImplementation(async (_path: string, init?: RequestInit) => {
      if (init?.method === 'POST' && apiFetch.mock.calls.length === 1) {
        await firstPush
      }
      return { ok: true, until: '2026-07-21T11:00:00.000Z' }
    })

    markTmDirty(first.id)
    const tmSync = syncTm({ pushOnly: true })
    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))
    markTmDirty(second.id)
    const baseSync = syncTmBase(first.baseId, { pushOnly: true })
    releaseFirstPush()
    await Promise.all([tmSync, baseSync])

    expect(apiFetch).toHaveBeenCalledTimes(2)
    expect(JSON.parse(apiFetch.mock.calls[1]![1].body).units).toEqual([second])
  })

  it('preserves dirty units added while a push is in flight', async () => {
    const first = unit({ id: 'first-unit' })
    const second = unit({ id: 'second-unit' })
    await Promise.all([putTmUnit(first), putTmUnit(second)])
    let releaseFirstPush!: () => void
    const firstPush = new Promise<void>((resolve) => {
      releaseFirstPush = resolve
    })
    apiFetch.mockImplementation(async (_path: string, init?: RequestInit) => {
      if (init?.method === 'POST' && apiFetch.mock.calls.length === 1) {
        await firstPush
      }
      return { ok: true, until: '2026-07-21T11:00:00.000Z' }
    })

    await markTmDirty(first.id)
    const syncing = syncTmBase(first.baseId, { pushOnly: true })
    await vi.waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))
    await markTmDirty(second.id)
    releaseFirstPush()
    await syncing

    expect(apiFetch).toHaveBeenCalledTimes(2)
    expect(JSON.parse(apiFetch.mock.calls[1]![1].body).units).toEqual([second])
  })

  it('pushes more than 500 dirty units in server-sized batches', async () => {
    const units = Array.from({ length: 501 }, (_, index) =>
      unit({ id: `unit-${index}` }),
    )
    await Promise.all(units.map((item) => putTmUnit(item)))
    apiFetch.mockResolvedValue({ ok: true, until: '2026-07-21T11:00:00.000Z' })

    await markTmDirty(...units.map((item) => item.id))
    await syncTmBase('named-1', { pushOnly: true })

    expect(apiFetch).toHaveBeenCalledTimes(2)
    expect(JSON.parse(apiFetch.mock.calls[0]![1].body).units).toHaveLength(500)
    expect(JSON.parse(apiFetch.mock.calls[1]![1].body).units).toHaveLength(1)
  })

  it('continues pushing other bases after one base fails', async () => {
    const failed = unit({ id: 'failed-unit', baseId: 'base-a' })
    const pushed = unit({ id: 'pushed-unit', baseId: 'base-b' })
    await Promise.all([putTmUnit(failed), putTmUnit(pushed)])
    apiFetch.mockImplementation(async (path: string) => {
      if (path === '/api/tm/bases/base-a/sync') throw new Error('base failed')
      return { ok: true, until: '2026-07-21T11:00:00.000Z' }
    })

    await markTmDirty(failed.id, pushed.id)
    await syncTm({ pushOnly: true })

    expect(apiFetch).toHaveBeenCalledWith('/api/tm/bases/base-b/sync', {
      method: 'POST',
      body: JSON.stringify({ units: [pushed] }),
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
