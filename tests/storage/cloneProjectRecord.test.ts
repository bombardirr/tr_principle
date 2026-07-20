import { describe, expect, it } from 'vitest'
import { cloneProjectRecord } from '@/storage/idb'
import { PERSONAL_TM_ATTACHMENT_ID } from '@/tm/projectAttachments'
import type { ProjectRecord } from '@/types/project'

function minimalRecord(meta: Partial<ProjectRecord['meta']> = {}): ProjectRecord {
  return {
    meta: {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'P',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      segmentCount: 0,
      doneCount: 0,
      ...meta,
    },
    segments: [],
    docx: new ArrayBuffer(8),
  }
}

describe('cloneProjectRecord', () => {
  it('copies tmAttachments for IndexedDB persistence', () => {
    const attachments = [
      { id: PERSONAL_TM_ATTACHMENT_ID, canRead: true, canWrite: false },
    ]
    const record = minimalRecord({ tmAttachments: attachments })

    const clone = cloneProjectRecord(record)

    expect(clone.meta.tmAttachments).toEqual(attachments)
    expect(clone.meta.tmAttachments).not.toBe(record.meta.tmAttachments)
    expect(clone.meta.tmAttachments?.[0]).not.toBe(record.meta.tmAttachments?.[0])
  })

  it('leaves tmAttachments undefined when absent', () => {
    const clone = cloneProjectRecord(minimalRecord())
    expect(clone.meta.tmAttachments).toBeUndefined()
  })
})
