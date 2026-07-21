import { describe, expect, it } from 'vitest'
import { PERSONAL_TM_ATTACHMENT_ID } from '../../src/tm/projectAttachments'
import {
  isJobEditorContext,
  resolvePersonalTmAccess,
} from '../../src/tm/personalTmAccess'
import type { ProjectMeta } from '../../src/types/project'

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

describe('isJobEditorContext', () => {
  it('requires matching query and meta.jobId', () => {
    expect(isJobEditorContext('j1', 'j1')).toBe(true)
    expect(isJobEditorContext('j1', 'j2')).toBe(false)
    expect(isJobEditorContext(undefined, 'j1')).toBe(false)
    expect(isJobEditorContext('j1', undefined)).toBe(false)
  })
})

describe('resolvePersonalTmAccess', () => {
  it('uses only project flags without job query', () => {
    const out = resolvePersonalTmAccess({
      projectMeta: meta({
        jobId: 'j1',
        tmAttachments: [{ id: PERSONAL_TM_ATTACHMENT_ID, canRead: true, canWrite: false }],
      }),
      jobQueryId: undefined,
      jobShared: [{ tmBaseId: PERSONAL_TM_ATTACHMENT_ID, canRead: true, canWrite: true }],
      jobLocal: [{ id: PERSONAL_TM_ATTACHMENT_ID, canRead: true, canWrite: true }],
    })
    expect(out).toEqual({ jobContext: false, canRead: true, canWrite: false })
  })

  it('ignores mismatched job query', () => {
    const out = resolvePersonalTmAccess({
      projectMeta: meta({
        jobId: 'j1',
        tmAttachments: [],
      }),
      jobQueryId: 'other',
      jobShared: [{ tmBaseId: PERSONAL_TM_ATTACHMENT_ID, canRead: true, canWrite: true }],
    })
    expect(out.jobContext).toBe(false)
    expect(out.canRead).toBe(false)
    expect(out.canWrite).toBe(false)
  })

  it('ORs job shared flags when in job context', () => {
    const out = resolvePersonalTmAccess({
      projectMeta: meta({
        jobId: 'j1',
        tmAttachments: [],
      }),
      jobQueryId: 'j1',
      jobShared: [{ tmBaseId: PERSONAL_TM_ATTACHMENT_ID, canRead: true, canWrite: true }],
    })
    expect(out).toEqual({ jobContext: true, canRead: true, canWrite: true })
  })

  it('ORs local overlay when in job context', () => {
    const out = resolvePersonalTmAccess({
      projectMeta: meta({
        jobId: 'j1',
        tmAttachments: [{ id: PERSONAL_TM_ATTACHMENT_ID, canRead: false, canWrite: false }],
      }),
      jobQueryId: 'j1',
      jobLocal: [{ id: PERSONAL_TM_ATTACHMENT_ID, canRead: true, canWrite: false }],
    })
    expect(out.canRead).toBe(true)
    expect(out.canWrite).toBe(false)
  })
})
