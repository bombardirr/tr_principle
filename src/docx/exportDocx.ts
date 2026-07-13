import JSZip from 'jszip'
import type { Segment } from '@/types/project'
import { prepareSegmentsForExport } from './tags'
import { applyTranslationsToStories } from './applyTranslations'
import { storiesToMap } from './openDocx'

export async function buildTranslatedDocx(
  originalBytes: ArrayBuffer,
  segments: Segment[],
): Promise<Blob> {
  const ready = prepareSegmentsForExport(segments)
  const zip = await JSZip.loadAsync(originalBytes)
  const stories = await storiesToMap(zip)
  const updated = applyTranslationsToStories(stories, ready)
  for (const [path, xml] of Object.entries(updated)) {
    zip.file(path, xml)
  }
  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
