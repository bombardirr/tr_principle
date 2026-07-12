import type { Segment } from '@/types/project'
import { splitTaggedText } from './tags'
import {
  allParagraphsLoose,
  collectRunsWithT,
  parseXml,
  serializeXml,
  setRunText,
} from './xmlUtils'

function effectiveTarget(segment: Segment): string {
  const t = segment.target.trim()
  return t === '' ? segment.source : segment.target
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

    for (const seg of fileSegments) {
      const para = paragraphs[seg.paraIndex]
      if (!para) continue

      const runs = collectRunsWithT(para)
      const parts = splitTaggedText(seg.source, effectiveTarget(seg))
      if (!parts) continue

      if (seg.spans.length === 0) continue

      if (seg.spans.length === 1 && parts.length === 1) {
        const span = seg.spans[0]!
        const firstIdx = span.runIndices[0]!
        const firstRun = runs[firstIdx]
        if (firstRun) setRunText(firstRun, parts[0]!)
        for (let i = 1; i < span.runIndices.length; i++) {
          const r = runs[span.runIndices[i]!]
          if (r) setRunText(r, '')
        }
        continue
      }

      seg.spans.forEach((span, spanIndex) => {
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
