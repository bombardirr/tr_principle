import { describe, expect, it } from 'vitest'
import { resolveGlossaryAccess } from '@/glossary/glossaryAccess'
import type { ProjectMeta } from '@/types/project'

const projectMeta: ProjectMeta = {
  id: 'project',
  name: 'Project',
  createdAt: '2026-07-22T00:00:00.000Z',
  updatedAt: '2026-07-22T00:00:00.000Z',
  segmentCount: 0,
  doneCount: 0,
  jobId: 'job-1',
}

describe('resolveGlossaryAccess', () => {
  it('returns R/W/E/C sets for job attachments in matching job context', () => {
    const access = resolveGlossaryAccess({
      projectMeta,
      jobQueryId: 'job-1',
      jobShared: [
        {
          glossaryBaseId: 'read-only',
          ownerId: 'owner-1',
          canRead: true,
          canWrite: false,
          canExport: false,
          canClone: false,
        },
        {
          glossaryBaseId: 'all-permissions',
          ownerId: 'owner-2',
          canRead: true,
          canWrite: true,
          canExport: true,
          canClone: true,
        },
      ],
    })

    expect(access).toEqual({
      jobContext: true,
      readableBaseIds: ['share:owner-1:read-only', 'share:owner-2:all-permissions'],
      writableBaseIds: ['share:owner-2:all-permissions'],
      exportableBaseIds: ['share:owner-2:all-permissions'],
      cloneableBaseIds: ['share:owner-2:all-permissions'],
    })
  })

  it('excludes job attachments outside matching job context', () => {
    const access = resolveGlossaryAccess({
      projectMeta,
      jobQueryId: 'another-job',
      jobShared: [
        {
          glossaryBaseId: 'base',
          ownerId: 'owner',
          canRead: true,
          canWrite: true,
          canExport: true,
          canClone: true,
        },
      ],
    })

    expect(access.readableBaseIds).toEqual([])
    expect(access.writableBaseIds).toEqual([])
    expect(access.exportableBaseIds).toEqual([])
    expect(access.cloneableBaseIds).toEqual([])
  })
})
