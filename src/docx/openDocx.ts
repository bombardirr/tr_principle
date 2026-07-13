import JSZip from 'jszip'
import type { Segment } from '@/types/project'
import { extractSegmentsFromStories, type StoryFile } from './extractSegments'
import { toArrayBuffer } from '@/utils/buffer'

export class DocxError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DocxError'
  }
}

async function loadStories(zip: JSZip): Promise<StoryFile[]> {
  const stories: StoryFile[] = []

  const documentXml = await zip.file('word/document.xml')?.async('string')
  if (!documentXml) {
    throw new DocxError('Не удалось найти word/document.xml — файл не является корректным DOCX')
  }
  stories.push({ key: 'document', path: 'word/document.xml', xml: documentXml })

  const names = Object.keys(zip.files).filter(
    (n) =>
      !zip.files[n]!.dir &&
      (n.match(/^word\/header\d+\.xml$/i) || n.match(/^word\/footer\d+\.xml$/i)),
  )
  names.sort()

  for (const path of names) {
    const xml = await zip.file(path)?.async('string')
    if (!xml) continue
    const base = path.split('/').pop()!.toLowerCase()
    const headerMatch = base.match(/^header(\d+)\.xml$/)
    const footerMatch = base.match(/^footer(\d+)\.xml$/)
    if (headerMatch) {
      stories.push({ key: `header:${headerMatch[1]}`, path, xml })
    } else if (footerMatch) {
      stories.push({ key: `footer:${footerMatch[1]}`, path, xml })
    }
  }

  return stories
}

export async function storiesToMap(zip: JSZip): Promise<Record<string, string>> {
  const stories = await loadStories(zip)
  const map: Record<string, string> = {}
  for (const s of stories) map[s.path] = s.xml
  return map
}

export interface OpenDocxResult {
  zipBytes: ArrayBuffer
  segments: Segment[]
}

export async function openDocx(input: File | ArrayBuffer | Uint8Array): Promise<OpenDocxResult> {
  let bytes: ArrayBuffer | Uint8Array
  if (input instanceof File) {
    bytes = await input.arrayBuffer()
  } else {
    bytes = input
  }

  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(bytes)
  } catch {
    throw new DocxError('Не удалось открыть файл. Убедитесь, что это не повреждённый DOCX.')
  }

  if (zip.file('EncryptedPackage') || zip.file('encryption.xml')) {
    throw new DocxError('Защищённые паролем документы пока не поддерживаются.')
  }

  const stories = await loadStories(zip)
  const segments = extractSegmentsFromStories(stories)

  const zipBytes = toArrayBuffer(bytes)

  return {
    zipBytes,
    segments,
  }
}

export async function readStoryMap(zipBytes: ArrayBuffer): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(zipBytes)
  return storiesToMap(zip)
}
