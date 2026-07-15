import { TAG_RE } from '@/docx/tags'
import { splitTmFragments } from './fragments'

/** Local: never use shared `/g` TAG_RE with String.match — lastIndex breaks scans. */
const TAG_AT_START = /^\{(\d+)\}/

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

/**
 * Split tagged segment text into sentence chunks.
 * Matching uses plain text; marker pairs are kept intact (cuts never fall between
 * an open `{n}` and its close).
 */
export function splitTaggedSentences(tagged: string): string[] {
  if (!tagged.trim()) return []

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
  const plain = plainChars.join('')
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
    const t = raw.trim()
    if (!t) return acc
    if (!acc) return t
    // Markers abut without an extra gap — spacing lives inside marker pairs.
    if (/\{(\d+)\}$/.test(acc) && /^\{(\d+)\}/.test(t)) return acc + t
    const needSpace = !/\s$/u.test(acc) && !/^[.,;:!?…»"'”)\]]/u.test(t)
    return acc + (needSpace ? ' ' : '') + t
  }, '')
}

export function paragraphKeyOf(storyKey: string, paraIndex: number): string {
  return `${storyKey}:${paraIndex}`
}
