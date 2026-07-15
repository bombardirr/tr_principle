import { TAG_RE } from './tags'
import type { Segment } from '@/types/project'
import { joinSentenceTargets } from '@/tm/sentences'
import { isSegmentDone } from '@/utils/segmentStatus'

export { isSegmentDone } from '@/utils/segmentStatus'

export const PREVIEW_HIT_CLASS = 'appzac-preview-hit'
export const PREVIEW_DONE_CLASS = 'appzac-preview-done'
export const PREVIEW_SEG_CLASS = 'appzac-preview-seg'
export const PREVIEW_SEGMENT_ATTR = 'data-appzac-segment-id'

export function segmentDisplayText(segment: Segment): string {
  const target = segment.target.trim()
  return target === '' ? segment.source : target
}

export function normalizePreviewText(text: string): string {
  return text
    .replace(TAG_RE, '')
    .replace(/\s+/g, ' ')
    // Tolerate join artifacts around date dots: "13. 04. 2026" → "13.04.2026"
    .replace(/(\d)\s*\.\s*(?=\d)/g, '$1.')
    .trim()
    .toLowerCase()
}

/** Plain display text for locating a sentence inside a preview paragraph. */
export function previewNeedle(text: string): string {
  return text.replace(TAG_RE, '').replace(/\s+/g, ' ').trim()
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

type TextPoint = { node: Text; offset: number }

function collectUnwrappedTextNodes(root: HTMLElement): Text[] {
  const nodes: Text[] = []
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    const parent = node.parentElement
    if (!parent?.closest(`[${PREVIEW_SEGMENT_ATTR}]`)) {
      nodes.push(node as Text)
    }
    node = walker.nextNode()
  }
  return nodes
}

/** Map collapsed-whitespace string ↔ original textContent offsets. */
function buildCollapsedMap(raw: string): { collapsed: string; toRaw: number[] } {
  const toRaw: number[] = []
  let collapsed = ''
  let i = 0
  while (i < raw.length) {
    const ch = raw[i]!
    if (/\s/u.test(ch)) {
      while (i < raw.length && /\s/u.test(raw[i]!)) i++
      if (collapsed.length > 0 && collapsed[collapsed.length - 1] !== ' ') {
        toRaw.push(i - 1)
        collapsed += ' '
      }
      continue
    }
    toRaw.push(i)
    collapsed += ch
    i++
  }
  const trimmed = collapsed.trim()
  if (trimmed !== collapsed) {
    const start = collapsed.length - collapsed.trimStart().length
    const end = start + trimmed.length
    return {
      collapsed: trimmed,
      toRaw: toRaw.slice(start, end),
    }
  }
  return { collapsed, toRaw }
}

function pointAtRawOffset(nodes: Text[], rawOffset: number): TextPoint | null {
  let seen = 0
  for (const node of nodes) {
    const len = node.data.length
    if (rawOffset <= seen + len) {
      return { node, offset: Math.max(0, rawOffset - seen) }
    }
    seen += len
  }
  const last = nodes[nodes.length - 1]
  if (!last) return null
  return { node: last, offset: last.data.length }
}

function wrapCharRange(
  root: HTMLElement,
  startRaw: number,
  endRaw: number,
  segmentId: string,
): HTMLElement | null {
  const nodes = collectUnwrappedTextNodes(root)
  if (!nodes.length || endRaw <= startRaw) return null

  const start = pointAtRawOffset(nodes, startRaw)
  const end = pointAtRawOffset(nodes, endRaw)
  if (!start || !end) return null

  const doc = root.ownerDocument
  const range = doc.createRange()
  try {
    range.setStart(start.node, start.offset)
    range.setEnd(end.node, end.offset)
  } catch {
    return null
  }

  const span = doc.createElement('span')
  span.className = PREVIEW_SEG_CLASS
  span.setAttribute(PREVIEW_SEGMENT_ATTR, segmentId)

  try {
    range.surroundContents(span)
  } catch {
    const contents = range.extractContents()
    span.appendChild(contents)
    range.insertNode(span)
  }
  return span
}

/**
 * Wrap each sentence of a paragraph into its own span (for per-sentence highlight).
 * Falls back to marking the whole paragraph when wrapping fails.
 */
export function wrapSentenceSegmentsInParagraph(
  para: HTMLElement,
  segments: Segment[],
): Map<string, HTMLElement> {
  const map = new Map<string, HTMLElement>()
  const sorted = [...segments].sort((a, b) => a.sentenceIndex - b.sentenceIndex)

  if (sorted.length === 1) {
    const only = sorted[0]!
    para.setAttribute(PREVIEW_SEGMENT_ATTR, only.id)
    map.set(only.id, para)
    return map
  }

  const nodes = collectUnwrappedTextNodes(para)
  const raw = nodes.map((n) => n.data).join('')
  const { collapsed, toRaw } = buildCollapsedMap(raw)

  type Slice = { id: string; startRaw: number; endRaw: number }
  const slices: Slice[] = []
  let searchFrom = 0

  for (const seg of sorted) {
    const needle = previewNeedle(segmentDisplayText(seg))
    if (!needle) continue
    const needleCollapsed = needle.replace(/\s+/g, ' ').trim()
    const idx = collapsed.toLowerCase().indexOf(needleCollapsed.toLowerCase(), searchFrom)
    if (idx < 0) continue
    const endIdx = idx + needleCollapsed.length
    const startRaw = toRaw[idx]
    const endRaw = toRaw[endIdx - 1]
    if (startRaw == null || endRaw == null) continue
    slices.push({ id: seg.id, startRaw, endRaw: endRaw + 1 })
    searchFrom = endIdx
  }

  // Wrap from the end so earlier raw offsets stay valid.
  for (const slice of [...slices].reverse()) {
    const el = wrapCharRange(para, slice.startRaw, slice.endRaw, slice.id)
    if (el) map.set(slice.id, el)
  }

  for (const seg of sorted) {
    if (!map.has(seg.id)) {
      // Partial failure: keep paragraph fallback for missing sentences (shared).
      para.setAttribute(PREVIEW_SEGMENT_ATTR, seg.id)
      map.set(seg.id, para)
    }
  }

  return map
}

/** Map segment id → highlightable element in docx-preview (sentence span or paragraph). */
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
    const wrapped = wrapSentenceSegmentsInParagraph(hit, sorted)
    for (const [id, el] of wrapped) map.set(id, el)
  }

  const unmappedGroups = orderedGroups.filter((g) => !g.every((s) => map.has(s.id)))
  const unused = paragraphs.filter(
    (paragraph) => !used.has(paragraph) && paragraphText(paragraph).length > 0,
  )
  for (let i = 0; i < unmappedGroups.length && i < unused.length; i++) {
    const group = unmappedGroups[i]!
    const hit = unused[i]!
    used.add(hit)
    const wrapped = wrapSentenceSegmentsInParagraph(hit, group)
    for (const [id, el] of wrapped) map.set(id, el)
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
    const el = index.get(segment.id)
    if (!el) continue
    if (isSegmentDone(segment)) {
      el.classList.add(PREVIEW_DONE_CLASS)
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
