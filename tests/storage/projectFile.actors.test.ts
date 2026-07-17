import { describe, expect, it } from 'vitest'
import { packProjectFile, unpackProjectFile } from '@/storage/projectFile'
import type { ProjectRecord } from '@/types/project'

async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer()
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = reject
    reader.readAsArrayBuffer(blob)
  })
}

describe('projectFile actors', () => {
  it('preserves segment audit by through zip round-trip', async () => {
    const record: ProjectRecord = {
      meta: {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'P',
        sourceLang: 'en',
        targetLang: 'ru',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      segments: [
        {
          id: 's1',
          storyKey: 's0',
          storyFile: 'word/document.xml',
          paraIndex: 0,
          paragraphKey: 's0:0',
          sentenceIndex: 0,
          source: 'Hello',
          target: 'Привет',
          status: 'done',
          inTable: false,
          inTextbox: false,
          inCaption: false,
          spans: [{ runIndices: [0], fingerprint: 'f', text: 'Hello' }],
          audit: [{ at: '2026-01-01T00:00:00.000Z', action: 'manual', by: 'anon:abc' }],
        },
      ],
      docx: new ArrayBuffer(8),
    }
    const blob = await packProjectFile(record)
    const again = await unpackProjectFile(await blobToArrayBuffer(blob))
    expect(again.segments[0]!.audit?.[0]!.by).toBe('anon:abc')
  })
})
