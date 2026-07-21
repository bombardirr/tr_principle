import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  listTmUnits,
  importTmUnits,
  syncTmBase,
  markTmDirty,
  exportTmx,
  downloadBlob,
} = vi.hoisted(() => ({
  listTmUnits: vi.fn(),
  importTmUnits: vi.fn(),
  syncTmBase: vi.fn(),
  markTmDirty: vi.fn(),
  exportTmx: vi.fn(),
  downloadBlob: vi.fn(),
}))

vi.mock('@/storage/tmIdb', () => ({
  listTmUnits,
  importTmUnits,
}))

vi.mock('@/tm/sync', () => ({
  syncTmBase,
  markTmDirty,
}))

vi.mock('@/tm/tmx', () => ({
  exportTmx,
}))

vi.mock('@/docx/exportDocx', () => ({
  downloadBlob,
}))

import { sharedTmLocalId } from '@/storage/tmBasesIdb'
import { cloneSharedJobTm, exportSharedJobTm } from '@/tm/jobTmIo'
import type { TmUnit } from '@/types/tm'

const jobId = 'job-1'
const ownerId = 'owner-1'
const tmBaseId = 'shared-base-1'
const targetBaseId = 'personal-tm'

function sampleUnit(overrides: Partial<TmUnit> = {}): TmUnit {
  return {
    id: 'unit-src-1',
    baseId: sharedTmLocalId(ownerId, tmBaseId),
    source: 'Hello',
    target: 'Привет',
    sourceKey: 'hello',
    createdAt: '2026-07-22T10:00:00.000Z',
    updatedAt: '2026-07-22T10:00:00.000Z',
    ...overrides,
  }
}

describe('jobTmIo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    syncTmBase.mockResolvedValue(undefined)
    exportTmx.mockReturnValue('<tmx/>')
    importTmUnits.mockResolvedValue({ count: 1, ids: ['new-id-1'] })
  })

  describe('exportSharedJobTm', () => {
    it('syncs when empty then exports and downloads', async () => {
      const localId = sharedTmLocalId(ownerId, tmBaseId)
      const unit = sampleUnit()
      listTmUnits.mockResolvedValueOnce([]).mockResolvedValueOnce([unit])

      const result = await exportSharedJobTm({
        jobId,
        ownerId,
        tmBaseId,
        label: 'My Base',
      })

      expect(listTmUnits).toHaveBeenCalledWith({ baseIds: [localId] })
      expect(syncTmBase).toHaveBeenCalledWith(tmBaseId, { jobId })
      expect(exportTmx).toHaveBeenCalledWith([unit], {
        sourceLang: undefined,
        targetLang: undefined,
      })
      expect(downloadBlob).toHaveBeenCalledOnce()
      expect(result).toEqual({ count: 1 })
    })

    it('returns count 0 without download when still empty after sync', async () => {
      listTmUnits.mockResolvedValue([])

      const result = await exportSharedJobTm({ jobId, ownerId, tmBaseId })

      expect(syncTmBase).toHaveBeenCalledWith(tmBaseId, { jobId })
      expect(downloadBlob).not.toHaveBeenCalled()
      expect(result).toEqual({ count: 0 })
    })
  })

  describe('cloneSharedJobTm', () => {
    it('copies units with new ids into target base and marks dirty', async () => {
      const unit = sampleUnit()
      listTmUnits.mockResolvedValue([unit])
      const newId = '00000000-0000-4000-8000-000000000099'
      vi.spyOn(crypto, 'randomUUID').mockReturnValue(newId)
      importTmUnits.mockResolvedValue({ count: 1, ids: [newId] })

      const result = await cloneSharedJobTm({
        jobId,
        ownerId,
        tmBaseId,
        targetBaseId,
      })

      expect(importTmUnits).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            id: newId,
            baseId: targetBaseId,
            deletedAt: null,
            source: unit.source,
            target: unit.target,
          }),
        ],
        { baseId: targetBaseId },
      )
      expect(markTmDirty).toHaveBeenCalledWith(newId)
      expect(result).toEqual({ count: 1 })
    })
  })
})
