import JSZip from 'jszip'
import { SEGMENT_SCHEMA_DATE_SAFE, type ProjectRecord } from '@/types/project'
import type { Job } from '@/types/job'

async function emptyDocx(): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>'
  )
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>'
  )
  zip.file(
    'word/document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body><w:p/><w:sectPr/></w:body></w:document>'
  )
  return zip.generateAsync({ type: 'arraybuffer' })
}

export async function createEmptyJobProject(
  job: Job,
  projectId: string,
  now = new Date().toISOString()
): Promise<ProjectRecord> {
  return {
    meta: {
      id: projectId,
      name: job.title || 'Untitled',
      createdAt: now,
      updatedAt: now,
      sourceLang: job.sourceLang || undefined,
      targetLang: job.targetLang || undefined,
      segmentSchemaVersion: SEGMENT_SCHEMA_DATE_SAFE,
      segmentCount: 0,
      doneCount: 0,
      jobId: job.id,
      sourceFilename: job.sourceFilename || undefined,
      sourceHash: job.sourceHash || undefined,
    },
    segments: [],
    docx: await emptyDocx(),
  }
}
