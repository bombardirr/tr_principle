import { TAG_RE } from './tags'
import type { Segment } from '@/types/project'
import { joinSentenceTargets } from '@/tm/sentences'
import { isSegmentDone } from '@/utils/segmentStatus'

export { isSegmentDone } from '@/utils/segmentStatus'

export const PREVIEW_HIT_CLASS = 'appzac-preview-hit'
export const PREVIEW_DONE_CLASS = 'appzac-preview-done'
export const PREVIEW_TM_CLASS = 'appzac-preview-tm'
export const PREVIEW_SEGMENT_ATTR = 'data-appzac-segment-id'

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

  const groups = new Map<string, Segment[]>()
  for (const segment of segments) {
    const key = segment.paragraphKey || segment.id
    const list = groups.get(key) ?? []
    list.push(segment)
    groups.set(key, list)
  }

  const orderedGroups = [...groups.values()]

  for (const group of orderedGroups) {
    const sorted = [...group].sort((a, b) => a.sentenceIndex - b.sentenceIndex)
    const joined = joinSentenceTargets(sorted.map(segmentDisplayText))
    const needle = normalizePreviewText(joined)
    const hit = findParagraphMatch(paragraphs, needle, used)
    if (!hit) continue
    used.add(hit)
    for (const segment of sorted) map.set(segment.id, hit)
  }

  const unmappedGroups = orderedGroups.filter((g) => !g.every((s) => map.has(s.id)))
  const unused = paragraphs.filter((paragraph) => !used.has(paragraph))
  for (let i = 0; i < unmappedGroups.length && i < unused.length; i++) {
    const group = unmappedGroups[i]!
    const hit = unused[i]!
    used.add(hit)
    for (const segment of group) map.set(segment.id, hit)
  }

  return map
}

export function markPreviewSegments(index: Map<string, HTMLElement>): void {
  for (const [segmentId, el] of index) {
    el.setAttribute(PREVIEW_SEGMENT_ATTR, segmentId)
  }
}

function eventTargetElement(target: EventTarget | null): Element | null {
  if (!target || typeof target !== 'object' || !('nodeType' in target)) return null
  const node = target as Node
  if (node.nodeType === node.ELEMENT_NODE) return node as Element
  if (node.nodeType === node.TEXT_NODE) return (node as Text).parentElement
  return null
}

export function resolvePreviewSegmentClick(target: EventTarget | null): string | null {
  const el = eventTargetElement(target)
  if (!el) return null
  const marked = el.hasAttribute(PREVIEW_SEGMENT_ATTR)
    ? el
    : el.closest(`[${PREVIEW_SEGMENT_ATTR}]`)
  return marked?.getAttribute(PREVIEW_SEGMENT_ATTR) ?? null
}

export function clearPreviewHighlights(host: HTMLElement): void {
  host
    .querySelectorAll(`.${PREVIEW_HIT_CLASS}, .${PREVIEW_DONE_CLASS}, .${PREVIEW_TM_CLASS}`)
    .forEach((el) => {
      el.classList.remove(PREVIEW_HIT_CLASS, PREVIEW_DONE_CLASS, PREVIEW_TM_CLASS)
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
  options?: { scroll?: boolean; tmSegmentIds?: ReadonlySet<string> },
): void {
  clearPreviewHighlights(host)

  for (const segment of segments) {
    const el = index.get(segment.id)
    if (!el) continue
    if (isSegmentDone(segment)) {
      el.classList.add(PREVIEW_DONE_CLASS)
      continue
    }
    if (options?.tmSegmentIds?.has(segment.id)) {
      el.classList.add(PREVIEW_TM_CLASS)
    }
  }

  if (!segmentId) return
  const el = index.get(segmentId)
  if (!el) return
  el.classList.add(PREVIEW_HIT_CLASS)
  if (options?.scroll !== false) {
    scrollWithinContainer(el, host)
  }
}
