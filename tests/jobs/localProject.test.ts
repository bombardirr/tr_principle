import { describe, expect, it } from 'vitest'
import { bindLocalProjectToCloudProject, inviteLink, projectFingerprint } from '@/jobs/localProject'
import type { CloudProject } from '@/types/cloudProject'
import type { ProjectRecord } from '@/types/project'

function project(): ProjectRecord {
  return {
    meta: {
      id: 'project-id',
      name: 'Manual',
      createdAt: '2026-07-17T00:00:00Z',
      updatedAt: '2026-07-17T00:00:00Z',
      segmentCount: 0,
      doneCount: 0,
    },
    segments: [],
    docx: new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer,
  }
}

const cloudProject: CloudProject = {
  id: 'cloud-project-id',
  ownerUserId: 'owner-id',
  title: 'Manual',
  sourceLang: 'en',
  targetLang: 'ru',
  sourceFilename: 'source.docx',
  sourceHash: 'source-hash',
  createdAt: '2026-07-17T00:00:00Z',
  updatedAt: '2026-07-17T00:00:00Z',
}

describe('projectFingerprint', () => {
  it('uses the stored source filename and hashes the actual DOCX bytes', async () => {
    const record = project()
    record.meta.sourceFilename = 'original.docx'

    await expect(projectFingerprint(record)).resolves.toEqual({
      filename: 'original.docx',
      hash: '8dcc7e601606217f3b754766511182a916b17e9a26a94c9d887104eba92e9bb2',
    })
  })

  it('falls back to the project name for legacy project files', async () => {
    await expect(projectFingerprint(project())).resolves.toMatchObject({
      filename: 'Manual.docx',
    })
  })
})

describe('bindLocalProjectToCloudProject', () => {
  it('links the local project and stores the canonical cloud project fingerprint', () => {
    const record = project()
    const linked = bindLocalProjectToCloudProject(record, cloudProject)

    expect(linked.meta).toMatchObject({
      projectId: 'cloud-project-id',
      sourceFilename: 'source.docx',
      sourceHash: 'source-hash',
    })
    expect(record.meta.projectId).toBeUndefined()
  })
})

describe('inviteLink', () => {
  it('encodes the raw token in the invite route', () => {
    expect(inviteLink('raw token/+', 'https://app.example/')).toBe(
      'https://app.example/project-invite/raw%20token%2F%2B'
    )
  })
})
