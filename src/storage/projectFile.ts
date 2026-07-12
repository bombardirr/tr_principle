import JSZip from 'jszip'
import type { ProjectRecord } from '@/types/project'
import { cloneProjectRecord } from './idb'

const MANIFEST = 'project.json'

export interface ProjectFilePayload {
  version: 1
  meta: ProjectRecord['meta']
  segments: ProjectRecord['segments']
}

export async function packProjectFile(record: ProjectRecord): Promise<Blob> {
  const plain = cloneProjectRecord(record)
  const zip = new JSZip()
  const payload: ProjectFilePayload = {
    version: 1,
    meta: plain.meta,
    segments: plain.segments,
  }
  zip.file(MANIFEST, JSON.stringify(payload))
  zip.file('original.docx', plain.docx)
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
}

export async function unpackProjectFile(input: File | ArrayBuffer): Promise<ProjectRecord> {
  const bytes = input instanceof File ? await input.arrayBuffer() : input
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(bytes)
  } catch {
    throw new Error('Не удалось открыть файл проекта')
  }

  const manifestRaw = await zip.file(MANIFEST)?.async('string')
  const docx = await zip.file('original.docx')?.async('arraybuffer')
  if (!manifestRaw || !docx) {
    throw new Error('Повреждённый файл проекта: нет project.json или original.docx')
  }

  let payload: ProjectFilePayload
  try {
    payload = JSON.parse(manifestRaw) as ProjectFilePayload
  } catch {
    throw new Error('Повреждённый файл проекта: некорректный JSON')
  }

  if (payload.version !== 1 || !payload.meta || !payload.segments) {
    throw new Error('Неподдерживаемая или повреждённая версия файла проекта')
  }

  return {
    meta: payload.meta,
    segments: payload.segments,
    docx,
  }
}
