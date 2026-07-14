import {
  SEGMENT_SCHEMA_SENTENCE,
  type ProjectMeta,
  type Segment,
} from '@/types/project'
import { isIntentionallyEmpty } from '@/utils/segmentStatus'
import { paragraphKeyOf, splitTaggedSentences } from './sentences'

export function projectNeedsResegment(meta: ProjectMeta | null | undefined): boolean {
  if (!meta) return false
  return (meta.segmentSchemaVersion ?? 1) < SEGMENT_SCHEMA_SENTENCE
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

export interface ResegmentResult {
  segments: Segment[]
  ambiguousCount: number
}

/**
 * Split legacy paragraph segments into sentence segments.
 * Existing targets are remapped 1:1 when sentence counts match; otherwise
 * the whole target stays on the first slot (caller should warn).
 */
export function resegmentParagraphs(segments: Segment[]): ResegmentResult {
  const out: Segment[] = []
  let ambiguousCount = 0

  for (const seg of segments) {
    const pKey = seg.paragraphKey || paragraphKeyOf(seg.storyKey, seg.paraIndex)
    const sources = splitTaggedSentences(seg.source)
    const parts = sources.length ? sources : [seg.source]
    const paragraphSpans = seg.paragraphSpans?.length
      ? seg.paragraphSpans
      : seg.spans
    const { targets, ambiguous } = mapTargetToSentences(parts, seg.target)
    if (ambiguous) ambiguousCount++
    const intentionalEmpty = isIntentionallyEmpty(seg)

    parts.forEach((source, sentenceIndex) => {
      const target = targets[sentenceIndex] ?? ''
      let status: Segment['status'] = 'empty'
      if (intentionalEmpty && sentenceIndex === 0) {
        status = 'done'
      } else if (target.trim()) {
        status = seg.status === 'draft' ? 'draft' : 'done'
      } else if (intentionalEmpty && sentenceIndex > 0) {
        status = 'empty'
      }

      out.push({
        ...seg,
        id: `${seg.id}-${sentenceIndex}`,
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

  // Stable sequential ids for the editor list.
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
