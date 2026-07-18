import {
  SEGMENT_SCHEMA_DATE_SAFE,
  type ProjectMeta,
  type ProjectRecord,
  type Segment,
} from '@/types/project'
import { isIntentionallyEmpty } from '@/utils/segmentStatus'
import { buildTaggedText } from '@/docx/tags'
import { openDocx } from '@/docx/openDocx'
import { joinSentenceTargets, paragraphKeyOf, splitParagraphUnits } from './sentences'

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
  const targetParts = splitParagraphUnits(target)
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
 * Preserves tabs so layout-field gaps survive a round-trip through resegment.
 */
export function joinParagraphPieces(parts: string[]): string {
  return parts.reduce((acc, raw) => {
    const t = raw.replace(/^ +/u, '').replace(/ +$/u, '').replace(/^\n+/, '').replace(/\n+$/, '')
    if (!t.replace(/\t/g, '').trim() && !/\t/.test(t)) return acc
    if (!acc) return t
    // Glue date fragments without injecting spaces: 30. + 03. + 2026
    if (/\d\.$/u.test(acc) && /^\d/u.test(t)) return acc + t
    const needSpace = !/\s$/u.test(acc) && !/^[.,;:!?…»"'”)\]]/u.test(t.trimStart())
    return acc + (needSpace ? ' ' : '') + t
  }, '')
}

export interface ResegmentResult {
  segments: Segment[]
  ambiguousCount: number
}

function paragraphFullSource(group: Segment[]): string {
  const head = group[0]!
  const spans = head.paragraphSpans?.length
    ? head.paragraphSpans
    : head.spans?.length
      ? head.spans
      : null
  if (spans?.length) {
    const texts = recoverLayoutGapsInSpanTexts(spans.map(s => s.text))
    const fromSpans = buildTaggedText(texts)
    if (/\t/.test(fromSpans) || spans.length > 1) return fromSpans
  }
  return joinParagraphPieces(group.map(s => s.source))
}

/**
 * Old extracts dropped w:tab runs, leaving adjacent label spans with only a single
 * space (or nothing) between them. Re-insert a tab gap so layout split can fire.
 */
function recoverLayoutGapsInSpanTexts(texts: string[]): string[] {
  if (texts.some(t => /\t{2,}/.test(t))) return texts
  const out = texts.map(t => t)
  for (let i = 0; i < out.length - 1; i++) {
    const cur = out[i]!
    const next = out[i + 1]!
    const a = cur.replace(/\s+/g, ' ').trim()
    const b = next.replace(/\s+/g, ' ').trim()
    if (!a || !b) continue
    // Skip sentence-like spans.
    if (a.length > 64 || b.length > 96) continue
    if (/[.!?…]/.test(a)) continue
    // Already a wide space column between them.
    if (/ {12,}$/.test(cur) || /^ {12,}/.test(next)) continue
    out[i] = cur.replace(/\s+$/u, '') + '\t\t\t\t'
    out[i + 1] = next.replace(/^\s+/u, '')
  }
  return out
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
    const fullSource = paragraphFullSource(sorted)
    const fullTarget = joinParagraphPieces(sorted.map(s => s.target))
    const intentionalEmpty =
      sorted.length === 1
        ? isIntentionallyEmpty(head)
        : sorted.every(isIntentionallyEmpty)

    const sources = splitParagraphUnits(fullSource)
    const parts = sources.length ? sources : [fullSource]
    const paragraphSpans = head.paragraphSpans?.length
      ? head.paragraphSpans
      : head.spans

    const { targets, ambiguous } = mapTargetToSentences(
      parts,
      intentionalEmpty ? '' : fullTarget || joinSentenceTargets(sorted.map(s => s.target)),
    )
    if (ambiguous) ambiguousCount++

    parts.forEach((source, sentenceIndex) => {
      const target = targets[sentenceIndex] ?? ''
      let status: Segment['status'] = 'empty'
      if (intentionalEmpty && sentenceIndex === 0) {
        status = 'done'
      } else if (target.trim()) {
        status = sorted.some(s => s.status === 'draft') ? 'draft' : 'done'
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

function groupByParagraph(segments: Segment[]): Map<string, Segment[]> {
  const groups = new Map<string, Segment[]>()
  for (const seg of segments) {
    const pKey = seg.paragraphKey || paragraphKeyOf(seg.storyKey, seg.paraIndex)
    const list = groups.get(pKey) ?? []
    list.push(seg)
    groups.set(pKey, list)
  }
  return groups
}

/**
 * Prefer a fresh extract from the stored DOCX (tabs / layout fields), then map
 * existing targets back onto the new units. Falls back to in-memory resegment.
 */
export async function resegmentProjectRecord(record: ProjectRecord): Promise<ResegmentResult> {
  if (record.docx.byteLength > 0) {
    try {
      const opened = await openDocx(record.docx)
      return remapTargetsOntoFresh(record.segments, opened.segments)
    } catch {
      // Corrupted / unsupported package — fall back to span-based resegment.
    }
  }
  return resegmentParagraphs(record.segments)
}

function remapTargetsOntoFresh(oldSegs: Segment[], fresh: Segment[]): ResegmentResult {
  const oldGroups = groupByParagraph(oldSegs)
  const freshGroups = groupByParagraph(fresh)
  const out: Segment[] = []
  let ambiguousCount = 0

  for (const [pKey, freshGroup] of freshGroups) {
    const sortedFresh = [...freshGroup].sort((a, b) => a.sentenceIndex - b.sentenceIndex)
    const oldGroup = oldGroups.get(pKey) ?? []
    const sortedOld = [...oldGroup].sort((a, b) => a.sentenceIndex - b.sentenceIndex)
    const head = sortedOld[0] ?? sortedFresh[0]!
    const intentionalEmpty =
      sortedOld.length > 0 &&
      (sortedOld.length === 1
        ? isIntentionallyEmpty(sortedOld[0]!)
        : sortedOld.every(isIntentionallyEmpty))

    const parts = sortedFresh.map(s => s.source)
    const fullTarget = intentionalEmpty
      ? ''
      : joinParagraphPieces(sortedOld.map(s => s.target))
    const { targets, ambiguous } = mapTargetToSentences(parts, fullTarget)
    if (ambiguous) ambiguousCount++

    sortedFresh.forEach((src, sentenceIndex) => {
      const target = targets[sentenceIndex] ?? ''
      let status: Segment['status'] = 'empty'
      if (intentionalEmpty && sentenceIndex === 0) status = 'done'
      else if (target.trim()) {
        status = sortedOld.some(s => s.status === 'draft') ? 'draft' : 'done'
      }
      out.push({
        ...src,
        target: intentionalEmpty && sentenceIndex === 0 ? '' : target,
        status,
        updatedAt: head.updatedAt,
        updatedBy: head.updatedBy,
        origin: head.origin,
        audit: head.audit,
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
