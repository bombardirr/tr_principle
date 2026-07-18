import type { Segment, TargetStyleRange } from '@/types/project'
import { isIntentionallyEmpty } from '@/utils/segmentStatus'
import { joinSentenceTargets } from '@/tm/sentences'
import { buildTaggedText, coerceTargetTags, splitTaggedText, stripMarkers } from './tags'
import { styledPiecesFromTarget, type StyledPiece } from './runStyle'
import {
  allParagraphsLoose,
  cloneRun,
  collectRunsWithT,
  insertRunAfter,
  parseXml,
  serializeXml,
  setRunStyle,
  setRunText,
} from './xmlUtils'

function effectiveTarget(segment: Segment): string {
  if (isIntentionallyEmpty(segment)) return ''
  const t = segment.target.trim()
  return t === '' ? segment.source : segment.target
}

function hasNonEmptyTargetStyles(segments: Segment[]): boolean {
  return segments.some((s) => (s.targetStyles?.length ?? 0) > 0)
}

/** Gap inserted between joined sentence plain targets (mirrors joinSentenceTargets). */
function joinSentenceGap(acc: string, raw: string): number {
  const t = raw.trim()
  if (!t || !acc) return 0
  if (/\{(\d+)\}$/.test(acc) && /^\{(\d+)\}/.test(t)) return 0
  const needSpace = !/\s$/u.test(acc) && !/^[.,;:!?…»"'”)\]]/u.test(t)
  return needSpace ? 1 : 0
}

function mergeParagraphTargetStyles(segments: Segment[]): TargetStyleRange[] | undefined {
  if (!hasNonEmptyTargetStyles(segments)) return undefined
  const sorted = [...segments].sort((a, b) => a.sentenceIndex - b.sentenceIndex)
  const merged: TargetStyleRange[] = []
  let acc = ''

  for (const seg of sorted) {
    const plain = stripMarkers(effectiveTarget(seg))
    const offset = acc.length === 0 ? 0 : acc.length + joinSentenceGap(acc, plain)
    for (const r of seg.targetStyles ?? []) {
      merged.push({
        ...r,
        start: r.start + offset,
        end: r.end + offset,
      })
    }
    acc = joinSentenceTargets([acc, plain])
  }

  return merged.length ? merged : undefined
}

function plainJoinedTarget(segments: Segment[]): string {
  const sorted = [...segments].sort((a, b) => a.sentenceIndex - b.sentenceIndex)
  return joinSentenceTargets(sorted.map((s) => stripMarkers(effectiveTarget(s))))
}

function applyStyledPiecesToParagraph(para: Element, pieces: StyledPiece[]): void {
  const runs = collectRunsWithT(para)
  for (const run of runs) setRunText(run, '')
  if (!pieces.length || !runs.length) return

  const template = runs[0]!
  let prevRun: Element | null = null

  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i]!
    const run = i === 0 ? template : cloneRun(template)
    if (i > 0 && prevRun) insertRunAfter(prevRun, run)
    setRunStyle(run, piece.style)
    setRunText(run, piece.text)
    prevRun = run
  }
}

function translationParts(segment: Segment): string[] | null {
  if (isIntentionallyEmpty(segment)) {
    if (segment.spans.length === 0) return null
    return segment.spans.map(() => '')
  }
  // Untranslated: write original span texts (avoids broken sentence-marker rejoin).
  if (segment.target.trim() === '') {
    return segment.spans.map((s) => s.text)
  }
  const parts = splitTaggedText(segment.source, effectiveTarget(segment))
  if (parts && parts.length === segment.spans.length) return parts
  // Mismatched marker join — fall back to span texts when target still equals source.
  if (effectiveTarget(segment) === segment.source) {
    return segment.spans.map((s) => s.text)
  }
  return parts
}

/** No user translation yet — keep original Word XML (tabs, runs, layout). */
function isPassthroughGroup(group: Segment[]): boolean {
  if (hasNonEmptyTargetStyles(group)) return false
  return group.every((s) => {
    if (isIntentionallyEmpty(s)) return false
    return s.target.trim() === '' || s.target === s.source
  })
}

/** Merge sentence siblings that share a Word paragraph into one apply unit. */
export function mergeParagraphGroup(segments: Segment[]): Segment | null {
  if (!segments.length) return null
  const sorted = [...segments].sort((a, b) => a.sentenceIndex - b.sentenceIndex)
  const head = sorted[0]!
  const paragraphSpans = head.paragraphSpans ?? head.spans
  // Structural source from Word spans — not rejoined sentence markup.
  const fullSource = buildTaggedText(paragraphSpans.map((s) => s.text))
  const allEmptyIntentional = sorted.every(isIntentionallyEmpty)
  // After prepareSegmentsForExport, empty segments get target=source — treat as untranslated.
  const untranslated = sorted.every(
    (s) => isIntentionallyEmpty(s) || s.target.trim() === '' || s.target === s.source,
  )
  let fullTarget = ''
  if (allEmptyIntentional) {
    fullTarget = ''
  } else if (untranslated) {
    fullTarget = fullSource
  } else {
    const joined = joinSentenceTargets(sorted.map((s) => effectiveTarget(s)))
    const parts = splitTaggedText(fullSource, joined)
    fullTarget =
      parts && parts.length === paragraphSpans.length
        ? joined
        : coerceTargetTags(fullSource, joined)
  }

  const targetStyles = mergeParagraphTargetStyles(sorted)

  return {
    ...head,
    source: fullSource,
    target: fullTarget,
    targetStyles,
    status: allEmptyIntentional
      ? 'done'
      : fullTarget.trim()
        ? 'done'
        : 'empty',
    spans: paragraphSpans,
    paragraphSpans,
  }
}

/** Apply segment translations into story XML strings. Returns updated path→xml map. */
export function applyTranslationsToStories(
  stories: Record<string, string>,
  segments: Segment[],
): Record<string, string> {
  const byFile = new Map<string, Segment[]>()
  for (const seg of segments) {
    const list = byFile.get(seg.storyFile) ?? []
    list.push(seg)
    byFile.set(seg.storyFile, list)
  }

  const out: Record<string, string> = { ...stories }

  for (const [path, fileSegments] of byFile) {
    const original = stories[path]
    if (!original) continue

    const doc = parseXml(original)
    const paragraphs = allParagraphsLoose(doc.documentElement)

    const groups = new Map<string, Segment[]>()
    for (const seg of fileSegments) {
      const key = seg.paragraphKey || `${seg.storyKey}:${seg.paraIndex}`
      const list = groups.get(key) ?? []
      list.push(seg)
      groups.set(key, list)
    }

    for (const group of groups.values()) {
      if (isPassthroughGroup(group)) continue

      const merged = mergeParagraphGroup(group)
      if (!merged) continue
      const para = paragraphs[merged.paraIndex]
      if (!para) continue

      if (hasNonEmptyTargetStyles(group)) {
        const plain = plainJoinedTarget(group)
        const pieces = styledPiecesFromTarget(plain, merged.targetStyles)
        applyStyledPiecesToParagraph(para, pieces)
        continue
      }

      const runs = collectRunsWithT(para)
      const parts = translationParts(merged)
      if (!parts) continue
      if (merged.spans.length === 0) continue

      if (merged.spans.length === 1 && parts.length === 1) {
        const span = merged.spans[0]!
        const firstIdx = span.runIndices[0]!
        const firstRun = runs[firstIdx]
        if (firstRun) setRunText(firstRun, parts[0]!)
        for (let i = 1; i < span.runIndices.length; i++) {
          const r = runs[span.runIndices[i]!]
          if (r) setRunText(r, '')
        }
        continue
      }

      merged.spans.forEach((span, spanIndex) => {
        const text = parts[spanIndex] ?? ''
        const firstIdx = span.runIndices[0]
        if (firstIdx === undefined) return
        const firstRun = runs[firstIdx]
        if (firstRun) setRunText(firstRun, text)
        for (let i = 1; i < span.runIndices.length; i++) {
          const r = runs[span.runIndices[i]!]
          if (r) setRunText(r, '')
        }
      })
    }

    const touched = [...groups.values()].some((group) => !isPassthroughGroup(group))
    out[path] = touched ? serializeXml(doc, original) : original
  }

  return out
}
