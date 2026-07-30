import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { createEmptyLocalProject } from '@/jobs/createProject'

describe('createEmptyLocalProject', () => {
  it('creates a valid empty DOCX shell linked to the cloud project', async () => {
    const record = await createEmptyLocalProject(
      {
        id: 'cloud-project-1',
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
      projectId: 'cloud-project-1',
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
