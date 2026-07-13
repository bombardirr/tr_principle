import { TAG_RE } from './tags'
import type { Segment } from '@/types/project'
import { isSegmentDone } from '@/utils/segmentStatus'

export { isSegmentDone } from '@/utils/segmentStatus'

export const PREVIEW_HIT_CLASS = 'appzac-preview-hit'
export const PREVIEW_DONE_CLASS = 'appzac-preview-done'

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

  const unmapped = segments.filter((segment) => !map.has(segment.id))
  const unused = paragraphs.filter((paragraph) => !used.has(paragraph))
  for (let i = 0; i < unmapped.length && i < unused.length; i++) {
    const segment = unmapped[i]!
    const hit = unused[i]!
    used.add(hit)
    map.set(segment.id, hit)
  }

  return map
}

export function clearPreviewHighlights(host: HTMLElement): void {
  host.querySelectorAll(`.${PREVIEW_HIT_CLASS}, .${PREVIEW_DONE_CLASS}`).forEach((el) => {
    el.classList.remove(PREVIEW_HIT_CLASS, PREVIEW_DONE_CLASS)
  })
}

function scrollWithinContainer(el: HTMLElement, container: HTMLElement): void {
  const elRect = el.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()
  const relativeTop = elRect.top - containerRect.top + container.scrollTop
  const target = relativeTop - container.clientHeight / 2 + elRect.height / 2
  container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
}

export function highlightPreviewSegment(
  host: HTMLElement,
  index: Map<string, HTMLElement>,
  segments: Segment[],
  segmentId: string | null,
  options?: { scroll?: boolean },
): void {
  clearPreviewHighlights(host)

  for (const segment of segments) {
    if (!isSegmentDone(segment)) continue
    const doneEl = index.get(segment.id)
    if (doneEl) doneEl.classList.add(PREVIEW_DONE_CLASS)
  }

  if (!segmentId) return
  const el = index.get(segmentId)
  if (!el) return
  el.classList.add(PREVIEW_HIT_CLASS)
  if (options?.scroll !== false) {
    scrollWithinContainer(el, host)
  }
}
