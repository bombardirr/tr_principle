import { describe, expect, it } from 'vitest'
import { PERSONAL_TM_ATTACHMENT_ID } from '@/tm/projectAttachments'
import { resolveTmBaseAccess } from '@/tm/tmAccess'
import type { ProjectMeta } from '@/types/project'

function meta(partial: Partial<ProjectMeta> = {}): ProjectMeta {
  return {
    id: 'p1',
    name: 'P',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    segmentCount: 0,
    doneCount: 0,
    ...partial,
  }
}

describe('resolveTmBaseAccess', () => {
  it('returns empty sets when nothing attached', () => {
    const out = resolveTmBaseAccess({ projectMeta: meta() })
    expect(out.readableBaseIds).toEqual([])
    expect(out.writableBaseIds).toEqual([])
  })

  it('collects multiple project bases', () => {
    const out = resolveTmBaseAccess({
      projectMeta: meta({
        tmAttachments: [
          { id: PERSONAL_TM_ATTACHMENT_ID, canRead: true, canWrite: true },
          { id: 'named-a', canRead: true, canWrite: false },
        ],
      }),
    })
    expect(out.readableBaseIds.sort()).toEqual([PERSONAL_TM_ATTACHMENT_ID, 'named-a'].sort())
    expect(out.writableBaseIds).toEqual([PERSONAL_TM_ATTACHMENT_ID])
  })

  it('ORs job layers only in job context', () => {
    const out = resolveTmBaseAccess({
      projectMeta: meta({ jobId: 'j1', tmAttachments: [] }),
      jobQueryId: 'j1',
      jobShared: [{ tmBaseId: 'named-b', canRead: true, canWrite: true }],
      jobLocal: [{ id: PERSONAL_TM_ATTACHMENT_ID, canRead: true, canWrite: false }],
    })
    expect(out.jobContext).toBe(true)
    expect(out.readableBaseIds.sort()).toEqual([PERSONAL_TM_ATTACHMENT_ID, 'named-b'].sort())
    expect(out.writableBaseIds).toEqual(['named-b'])
  })

  it('ignores job layers without matching job query', () => {
    const out = resolveTmBaseAccess({
      projectMeta: meta({ jobId: 'j1', tmAttachments: [] }),
      jobQueryId: undefined,
      jobShared: [{ tmBaseId: 'named-b', canRead: true, canWrite: true }],
    })
    expect(out.readableBaseIds).toEqual([])
    expect(out.writableBaseIds).toEqual([])
  })
})
