import type { Segment } from '@/types/project'
import { isIntentionallyEmpty } from '@/utils/segmentStatus'
import { joinSentenceTargets } from '@/tm/sentences'
import { splitTaggedText } from './tags'
import {
  allParagraphsLoose,
  collectRunsWithT,
  parseXml,
  serializeXml,
  setRunText,
} from './xmlUtils'

function effectiveTarget(segment: Segment): string {
  if (isIntentionallyEmpty(segment)) return ''
  const t = segment.target.trim()
  return t === '' ? segment.source : segment.target
}

function translationParts(segment: Segment): string[] | null {
  if (isIntentionallyEmpty(segment)) {
    if (segment.spans.length === 0) return null
    return segment.spans.map(() => '')
  }
  return splitTaggedText(segment.source, effectiveTarget(segment))
}

/** Merge sentence siblings that share a Word paragraph into one apply unit. */
export function mergeParagraphGroup(segments: Segment[]): Segment | null {
  if (!segments.length) return null
  const sorted = [...segments].sort((a, b) => a.sentenceIndex - b.sentenceIndex)
  const head = sorted[0]!
  const paragraphSpans = head.paragraphSpans ?? head.spans
  const fullSource =
    sorted.length === 1
      ? head.source
      : joinSentenceTargets(sorted.map((s) => s.source))
  const allEmptyIntentional = sorted.every(isIntentionallyEmpty)
  const fullTarget = allEmptyIntentional
    ? ''
    : joinSentenceTargets(sorted.map((s) => effectiveTarget(s)))

  return {
    ...head,
    source: fullSource,
    target: fullTarget,
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
      const merged = mergeParagraphGroup(group)
      if (!merged) continue
      const para = paragraphs[merged.paraIndex]
      if (!para) continue

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

    out[path] = serializeXml(doc, original)
  }

  return out
}
