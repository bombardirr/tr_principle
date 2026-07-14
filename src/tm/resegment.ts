import {
  SEGMENT_SCHEMA_DATE_SAFE,
  type ProjectMeta,
  type Segment,
} from '@/types/project'
import { isIntentionallyEmpty } from '@/utils/segmentStatus'
import { joinSentenceTargets, paragraphKeyOf, splitTaggedSentences } from './sentences'

export function projectNeedsResegment(
  meta: ProjectMeta | null | undefined,
  segments?: Segment[] | null,
): boolean {
  if (!meta) return false
  if ((meta.segmentSchemaVersion ?? 1) < SEGMENT_SCHEMA_DATE_SAFE) return true
  return Boolean(segments && segmentsLookDateShredded(segments))
}

/** Tiny leftover pieces from date dots being treated as sentence ends. */
export function segmentsLookDateShredded(segments: Segment[]): boolean {
  return segments.some((s) => {
    const t = s.source.replace(/\{[^}]*\}/g, '').trim()
    return (
      /^\d{1,2}\.$/u.test(t) ||
      /^\d{1,2}\.\d{1,2}\.$/u.test(t) ||
      /^\d{4}\s*г\.?$/iu.test(t)
    )
  })
}

/** Map a paragraph-level target onto sentence slots. */
export function mapTargetToSentences(
  sourceParts: string[],
  target: string,
): { targets: string[]; ambiguous: boolean } {
  const n = sourceParts.length
  if (n === 0) return { targets: [], ambiguous: false }
  if (!target.trim()) {
    return { targets: Array.from({ length: n }, () => ''), ambiguous: false }
  }
  const targetParts = splitTaggedSentences(target)
  if (targetParts.length === n) {
    return { targets: targetParts, ambiguous: false }
  }
  // Uncertain: keep full translation on the first slot, leave the rest empty.
  return {
    targets: sourceParts.map((_, i) => (i === 0 ? target : '')),
    ambiguous: true,
  }
}

/**
 * Reassemble a paragraph that was wrongly cut on date dots: "30."+"03."+"2026 г.".
 */
export function joinParagraphPieces(parts: string[]): string {
  return parts.reduce((acc, raw) => {
    const t = raw.trim()
    if (!t) return acc
    if (!acc) return t
    // Glue date fragments without injecting spaces: 30. + 03. + 2026
    if (/\d\.$/u.test(acc) && /^\d/u.test(t)) return acc + t
    const needSpace = !/\s$/u.test(acc) && !/^[.,;:!?…»"'”)\]]/u.test(t)
    return acc + (needSpace ? ' ' : '') + t
  }, '')
}

export interface ResegmentResult {
  segments: Segment[]
  ambiguousCount: number
}

/**
 * Regroup by paragraph, merge pieces, then sentence-split with date-safe rules.
 * Fixes legacy paragraph projects and date-shredded sentence projects.
 */
export function resegmentParagraphs(segments: Segment[]): ResegmentResult {
  const groups = new Map<string, Segment[]>()
  for (const seg of segments) {
    const pKey = seg.paragraphKey || paragraphKeyOf(seg.storyKey, seg.paraIndex)
    const list = groups.get(pKey) ?? []
    list.push(seg)
    groups.set(pKey, list)
  }

  const out: Segment[] = []
  let ambiguousCount = 0

  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.sentenceIndex - b.sentenceIndex)
    const head = sorted[0]!
    const pKey = head.paragraphKey || paragraphKeyOf(head.storyKey, head.paraIndex)
    const fullSource = joinParagraphPieces(sorted.map((s) => s.source))
    const fullTarget = joinParagraphPieces(sorted.map((s) => s.target))
    const intentionalEmpty =
      sorted.length === 1
        ? isIntentionallyEmpty(head)
        : sorted.every(isIntentionallyEmpty)

    const sources = splitTaggedSentences(fullSource)
    const parts = sources.length ? sources : [fullSource]
    const paragraphSpans = head.paragraphSpans?.length
      ? head.paragraphSpans
      : head.spans

    const { targets, ambiguous } = mapTargetToSentences(
      parts,
      intentionalEmpty ? '' : fullTarget || joinSentenceTargets(sorted.map((s) => s.target)),
    )
    if (ambiguous) ambiguousCount++

    parts.forEach((source, sentenceIndex) => {
      const target = targets[sentenceIndex] ?? ''
      let status: Segment['status'] = 'empty'
      if (intentionalEmpty && sentenceIndex === 0) {
        status = 'done'
      } else if (target.trim()) {
        status = sorted.some((s) => s.status === 'draft') ? 'draft' : 'done'
      }

      out.push({
        ...head,
        id: `${head.id}-${sentenceIndex}`,
        paragraphKey: pKey,
        sentenceIndex,
        source,
        target: intentionalEmpty && sentenceIndex === 0 ? '' : target,
        status,
        spans: sentenceIndex === 0 ? paragraphSpans.map(cloneSpan) : [],
        paragraphSpans: paragraphSpans.map(cloneSpan),
        tmSavePending: false,
      })
    })
  }

  return {
    segments: out.map((seg, i) => ({ ...seg, id: String(i + 1) })),
    ambiguousCount,
  }
}

function cloneSpan(sp: Segment['spans'][number]) {
  return {
    runIndices: [...sp.runIndices],
    fingerprint: sp.fingerprint,
    text: sp.text,
  }
}
