import { beforeEach, describe, expect, it, vi } from 'vitest'

const { listGlossaryTerms, putGlossaryTerm, syncGlossaryBase, markGlossaryDirty, exportTbx, downloadBlob } =
  vi.hoisted(() => ({
    listGlossaryTerms: vi.fn(),
    putGlossaryTerm: vi.fn(),
    syncGlossaryBase: vi.fn(),
    markGlossaryDirty: vi.fn(),
    exportTbx: vi.fn(),
    downloadBlob: vi.fn(),
  }))

vi.mock('@/storage/glossaryIdb', () => ({ listGlossaryTerms, putGlossaryTerm }))
vi.mock('@/glossary/sync', () => ({ syncGlossaryBase, markGlossaryDirty }))
vi.mock('@/glossary/tbx', () => ({ exportTbx }))
vi.mock('@/docx/exportDocx', () => ({ downloadBlob }))

import { sharedGlossaryLocalId } from '@/storage/glossaryBasesIdb'
import { cloneSharedJobGlossary, exportSharedJobGlossary } from '@/glossary/jobGlossaryIo'
import type { GlossaryTerm } from '@/types/glossary'

const jobId = 'job-1'
const ownerId = 'owner-1'
const glossaryBaseId = 'shared-base-1'
const targetBaseId = 'personal-glossary'

function sampleTerm(overrides: Partial<GlossaryTerm> = {}): GlossaryTerm {
  return {
    id: 'term-src-1',
    baseId: sharedGlossaryLocalId(ownerId, glossaryBaseId),
    sourceLang: 'en',
    targetLang: 'ru',
    sourceTerm: 'Hello',
    targetTerm: 'Привет',
    status: 'approved',
    caseSensitive: false,
    createdAt: '2026-07-22T10:00:00.000Z',
    updatedAt: '2026-07-22T10:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

describe('jobGlossaryIo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    syncGlossaryBase.mockResolvedValue(undefined)
    exportTbx.mockReturnValue('<martif/>')
    putGlossaryTerm.mockResolvedValue(undefined)
  })

  it('syncs an empty shared base before exporting its TBX', async () => {
    const localId = sharedGlossaryLocalId(ownerId, glossaryBaseId)
    const term = sampleTerm()
    listGlossaryTerms.mockResolvedValueOnce([]).mockResolvedValueOnce([term])

    const result = await exportSharedJobGlossary({
      jobId,
      ownerId,
      glossaryBaseId,
      label: 'My glossary',
    })

    expect(listGlossaryTerms).toHaveBeenCalledWith({ baseIds: [localId] })
    expect(syncGlossaryBase).toHaveBeenCalledWith(localId, { jobId })
    expect(exportTbx).toHaveBeenCalledWith([term])
    expect(downloadBlob).toHaveBeenCalledOnce()
    expect(result).toEqual({ count: 1 })
  })

  it('returns zero without a download when sync has no terms', async () => {
    listGlossaryTerms.mockResolvedValue([])
    await expect(exportSharedJobGlossary({ jobId, ownerId, glossaryBaseId })).resolves.toEqual({
      count: 0,
    })
    expect(downloadBlob).not.toHaveBeenCalled()
  })

  it('clones shared terms into the target base and marks copies dirty', async () => {
    const term = sampleTerm()
    const newId = '00000000-0000-4000-8000-000000000099'
    listGlossaryTerms.mockResolvedValue([term])
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(newId)

    await expect(
      cloneSharedJobGlossary({ jobId, ownerId, glossaryBaseId, targetBaseId }),
    ).resolves.toEqual({ count: 1 })

    expect(putGlossaryTerm).toHaveBeenCalledWith(
      expect.objectContaining({
        id: newId,
        baseId: targetBaseId,
        sourceTerm: term.sourceTerm,
        targetTerm: term.targetTerm,
        deletedAt: null,
      }),
    )
    expect(markGlossaryDirty).toHaveBeenCalledWith(newId)
  })
})
