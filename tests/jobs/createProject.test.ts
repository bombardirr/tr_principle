import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { createEmptyJobProject } from '@/jobs/createProject'

describe('createEmptyJobProject', () => {
  it('creates a valid empty DOCX shell linked to the job', async () => {
    const record = await createEmptyJobProject(
      {
        id: 'job-1',
        ownerUserId: 'owner-1',
        title: 'Shared translation',
        sourceLang: 'ru',
        targetLang: 'en',
        sourceFilename: '',
        sourceHash: '',
        createdAt: '2026-07-17T00:00:00.000Z',
        updatedAt: '2026-07-17T00:00:00.000Z',
      },
      'project-1',
      '2026-07-17T12:00:00.000Z'
    )

    expect(record.meta).toMatchObject({
      id: 'project-1',
      name: 'Shared translation',
      jobId: 'job-1',
      sourceLang: 'ru',
      targetLang: 'en',
      segmentCount: 0,
      doneCount: 0,
    })
    expect(record.segments).toEqual([])

    const zip = await JSZip.loadAsync(record.docx)
    expect(await zip.file('word/document.xml')?.async('string')).toContain('<w:body>')
  })
})
