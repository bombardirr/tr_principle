import { beforeEach, describe, expect, it, vi } from 'vitest'

const { apiFetch, syncGlossaryBase, markGlossaryBaseDirty, ensureGlossaryBase } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  syncGlossaryBase: vi.fn(),
  markGlossaryBaseDirty: vi.fn(),
  ensureGlossaryBase: vi.fn(),
}))

vi.mock('@/auth/api', () => ({ apiFetch }))
vi.mock('@/glossary/sync', () => ({ syncGlossaryBase, markGlossaryBaseDirty }))
vi.mock('@/storage/glossaryBasesIdb', () => ({ ensureGlossaryBase }))

import { createJobGlossaryAttachment } from '@/jobs/glossaryAttachmentsApi'

describe('createJobGlossaryAttachment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ensureGlossaryBase.mockResolvedValue({ id: 'base-1' })
    syncGlossaryBase.mockResolvedValue(undefined)
    apiFetch.mockResolvedValue({ id: 'attachment-1' })
  })

  it('marks every local term dirty before promoting the base', async () => {
    await createJobGlossaryAttachment('job-1', { glossaryBaseId: 'base-1' })

    expect(markGlossaryBaseDirty).toHaveBeenCalledWith('base-1')
    expect(markGlossaryBaseDirty.mock.invocationCallOrder[0]).toBeLessThan(
      syncGlossaryBase.mock.invocationCallOrder[0],
    )
    expect(syncGlossaryBase).toHaveBeenCalledWith('base-1', { pushOnly: true })
  })
})
