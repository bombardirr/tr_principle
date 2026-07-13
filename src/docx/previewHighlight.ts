import { TAG_RE } from './tags'
import type { Segment } from '@/types/project'

export const PREVIEW_HIT_CLASS = 'appzac-preview-hit'

export function segmentDisplayText(segment: Segment): string {
  const target = segment.target.trim()
  return target === '' ? segment.source : target
}

export function normalizePreviewText(text: string): string {
  return text.replace(TAG_RE, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

function paragraphText(el: Element): string {
  return normalizePreviewText(el.textContent ?? '')
}

function findParagraphMatch(
  paragraphs: HTMLElement[],
  needle: string,
  used: Set<HTMLElement>,
): HTMLElement | undefined {
  if (!needle) return undefined

  const exact = paragraphs.find((p) => !used.has(p) && paragraphText(p) === needle)
  if (exact) return exact

  const contains = paragraphs.find(
    (p) => !used.has(p) && paragraphText(p).includes(needle),
  )
  if (contains) return contains

  return paragraphs.find(
    (p) => !used.has(p) && needle.includes(paragraphText(p)) && paragraphText(p).length > 0,
  )
}

/** Map segment id → paragraph element in docx-preview output (best-effort). */
export function indexPreviewSegments(
  host: HTMLElement,
  segments: Segment[],
): Map<string, HTMLElement> {
  const paragraphs = [...host.querySelectorAll('p')] as HTMLElement[]
  const used = new Set<HTMLElement>()
  const map = new Map<string, HTMLElement>()

  for (const segment of segments) {
    const needle = normalizePreviewText(segmentDisplayText(segment))
    const hit = findParagraphMatch(paragraphs, needle, used)
    if (!hit) continue
    used.add(hit)
    map.set(segment.id, hit)
  }

  return map
}

export function clearPreviewHighlights(host: HTMLElement): void {
  host.querySelectorAll(`.${PREVIEW_HIT_CLASS}`).forEach((el) => {
    el.classList.remove(PREVIEW_HIT_CLASS)
  })
}

export function highlightPreviewSegment(
  host: HTMLElement,
  index: Map<string, HTMLElement>,
  segmentId: string | null,
  options?: { scroll?: boolean },
): void {
  clearPreviewHighlights(host)
  if (!segmentId) return
  const el = index.get(segmentId)
  if (!el) return
  el.classList.add(PREVIEW_HIT_CLASS)
  if (options?.scroll !== false) {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
}
