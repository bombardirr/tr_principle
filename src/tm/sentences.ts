import { TAG_RE } from '@/docx/tags'
import { splitTmFragments } from './fragments'

/** Local: never use shared `/g` TAG_RE with String.match — lastIndex breaks scans. */
const TAG_AT_START = /^\{(\d+)\}/

/** 2+ tabs, or a wide space column (avoids short underline blanks ~8 spaces). */
const LAYOUT_GAP_RE = /\t{2,}| {12,}/g

type TagToken = { id: number; start: number; end: number }
type TagPair = { openStart: number; contentStart: number; contentEnd: number; closeEnd: number }

function tagTokens(tagged: string): TagToken[] {
  const toks: TagToken[] = []
  for (const m of tagged.matchAll(TAG_RE)) {
    toks.push({
      id: Number(m[1]),
      start: m.index!,
      end: m.index! + m[0].length,
    })
  }
  return toks
}

function tagPairs(tagged: string): TagPair[] {
  const toks = tagTokens(tagged)
  const pairs: TagPair[] = []
  for (let i = 0; i + 1 < toks.length; i += 2) {
    const open = toks[i]!
    const close = toks[i + 1]!
    pairs.push({
      openStart: open.start,
      contentStart: open.end,
      contentEnd: close.start,
      closeEnd: close.end,
    })
  }
  return pairs
}

/**
 * Move a cut so it never lands inside a `{n}` token or inside a marker pair.
 * If the natural cut is inside pair content, assign the whole pair to the following
 * sentence (snap to the opening marker).
 */
function snapCutOutsideMarkers(tagged: string, cut: number): number {
  if (cut <= 0) return 0
  if (cut >= tagged.length) return tagged.length

  for (const tok of tagTokens(tagged)) {
    if (cut > tok.start && cut < tok.end) return tok.end
  }

  for (const pair of tagPairs(tagged)) {
    if (cut > pair.openStart && cut < pair.closeEnd) {
      // Prefer whole pair with the following sentence when cut is in content.
      if (cut >= pair.contentStart && cut <= pair.contentEnd) return pair.openStart
      // Inside close token already handled; be conservative.
      return pair.closeEnd
    }
  }
  return cut
}

function plainFromTagged(tagged: string): { plain: string; plainToTagged: number[] } {
  const plainChars: string[] = []
  const plainToTagged: number[] = []
  let i = 0
  while (i < tagged.length) {
    const rest = tagged.slice(i)
    const m = rest.match(TAG_AT_START)
    if (m) {
      i += m[0].length
      continue
    }
    plainChars.push(tagged[i]!)
    plainToTagged.push(i)
    i++
  }
  return { plain: plainChars.join(''), plainToTagged }
}

function markersBalanced(tagged: string): boolean {
  const toks = tagTokens(tagged)
  if (toks.length % 2 !== 0) return false
  for (let i = 0; i + 1 < toks.length; i += 2) {
    if (toks[i]!.id !== toks[i + 1]!.id) return false
  }
  return true
}

function stripMarkerTokens(tagged: string): string {
  return tagged.replace(TAG_RE, '')
}

/**
 * Split tagged / plain paragraph text on large layout gaps (tabs / wide spaces)
 * between text islands. Gap stays on the previous piece so joinSentenceTargets
 * does not insert an extra space.
 */
export function splitTaggedLayoutFields(tagged: string): string[] {
  if (!tagged.trim()) return []

  const { plain, plainToTagged } = plainFromTagged(tagged)
  if (!plain.trim()) return [tagged]

  const gaps: { start: number; end: number }[] = []
  LAYOUT_GAP_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = LAYOUT_GAP_RE.exec(plain)) !== null) {
    const start = m.index
    const end = start + m[0].length
    if (!plain.slice(0, start).trim() || !plain.slice(end).trim()) continue
    gaps.push({ start, end })
  }
  if (!gaps.length) return [tagged]

  const plainCuts = [0, ...gaps.map(g => g.end), plain.length]
  const taggedCuts: number[] = plainCuts.map(cp => {
    if (cp <= 0) return 0
    if (cp >= plain.length) return tagged.length
    return plainToTagged[cp] ?? tagged.length
  })

  for (let i = 1; i < taggedCuts.length; i++) {
    if (taggedCuts[i]! < taggedCuts[i - 1]!) taggedCuts[i] = taggedCuts[i - 1]!
  }

  const chunks: string[] = []
  for (let i = 0; i < taggedCuts.length - 1; i++) {
    const from = taggedCuts[i]!
    const to = taggedCuts[i + 1]!
    let slice = tagged.slice(from, to)
    if (!markersBalanced(slice)) slice = stripMarkerTokens(slice)
    // Trim newlines only — spaces/tabs may be layout gaps.
    slice = slice.replace(/^\n+/, '').replace(/\n+$/, '')
    if (stripMarkerTokens(slice).trim().length === 0) continue
    chunks.push(slice)
  }

  return chunks.length ? chunks : [tagged]
}

/** Layout-field split, then sentence split inside each field. */
export function splitParagraphUnits(tagged: string): string[] {
  const layoutParts = splitTaggedLayoutFields(tagged)
  const out: string[] = []
  for (const part of layoutParts) {
    const sentences = splitTaggedSentences(part)
    if (sentences.length) out.push(...sentences)
    else if (stripMarkerTokens(part).trim()) out.push(part)
  }
  return out
}

/**
 * Split tagged segment text into sentence chunks.
 * Matching uses plain text; marker pairs are kept intact (cuts never fall between
 * an open `{n}` and its close).
 */
export function splitTaggedSentences(tagged: string): string[] {
  if (!tagged.trim()) return []

  const { plain, plainToTagged } = plainFromTagged(tagged)
  if (!plain.trim()) return [tagged]

  const plainParts = splitTmFragments(plain)
  if (plainParts.length <= 1) return [tagged]

  const ranges: { startPlain: number; endPlain: number }[] = []
  let searchFrom = 0
  for (const part of plainParts) {
    const startPlain = plain.indexOf(part, searchFrom)
    if (startPlain === -1) {
      ranges.push({ startPlain: searchFrom, endPlain: searchFrom + part.length })
      searchFrom += part.length
      continue
    }
    ranges.push({ startPlain, endPlain: startPlain + part.length })
    searchFrom = startPlain + part.length
  }

  // Contiguous tagged cuts: [0, cut1, cut2, ..., end].
  const cuts: number[] = [0]
  for (let p = 0; p < ranges.length - 1; p++) {
    const nextStart = ranges[p + 1]!.startPlain
    const natural = plainToTagged[nextStart] ?? tagged.length
    cuts.push(snapCutOutsideMarkers(tagged, natural))
  }
  cuts.push(tagged.length)

  const chunks: string[] = []
  for (let p = 0; p < ranges.length; p++) {
    const from = cuts[p]!
    const end = cuts[p + 1]!
    const slice = tagged.slice(from, end)
    // Keep marker tokens; only drop outer whitespace.
    const trimmed = slice.replace(/^\s+/, '').replace(/\s+$/, '')
    chunks.push(trimmed || plainParts[p]!)
  }

  return chunks.filter((c) => c.replace(TAG_RE, '').trim().length > 0)
}

/** Join sentence targets into one paragraph string for DOCX write-back. */
export function joinSentenceTargets(targets: string[]): string {
  return targets.reduce((acc, raw) => {
    // Keep trailing tabs (layout); strip only spaces/newlines on the edges.
    const t = raw.replace(/^ +/u, '').replace(/ +$/u, '').replace(/^\n+/, '').replace(/\n+$/, '')
    if (!t.replace(/\t/g, '').trim() && !/\t/.test(t)) return acc
    if (!acc) return t
    // Markers abut without an extra gap — spacing lives inside marker pairs.
    if (/\{(\d+)\}$/.test(acc) && /^\{(\d+)\}/.test(t)) return acc + t
    // Tabs / trailing whitespace already separate layout fields.
    const needSpace = !/\s$/u.test(acc) && !/^[.,;:!?…»"'”)\]]/u.test(t.trimStart())
    return acc + (needSpace ? ' ' : '') + t
  }, '')
}

export function paragraphKeyOf(storyKey: string, paraIndex: number): string {
  return `${storyKey}:${paraIndex}`
}
