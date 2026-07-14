import { TAG_RE } from '@/docx/tags'
import { splitTmFragments } from './fragments'

/**
 * Split tagged segment text into sentence chunks.
 * Matching uses plain text; tags that fall inside a plain sentence stay in that chunk.
 */
export function splitTaggedSentences(tagged: string): string[] {
  if (!tagged.trim()) return []

  const plainChars: string[] = []
  const plainToTagged: number[] = []
  let i = 0
  while (i < tagged.length) {
    const rest = tagged.slice(i)
    const m = rest.match(TAG_RE)
    if (m && m.index === 0) {
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

  const chunks: string[] = []
  let searchFrom = 0
  for (let p = 0; p < plainParts.length; p++) {
    const part = plainParts[p]!
    const startPlain = plain.indexOf(part, searchFrom)
    if (startPlain === -1) {
      chunks.push(part)
      continue
    }
    const endPlain = startPlain + part.length
    const startTagged = plainToTagged[startPlain] ?? 0
    let endTagged =
      endPlain < plainToTagged.length ? plainToTagged[endPlain]! : tagged.length

    // If this is the last part, take through end so trailing tags are kept.
    if (p === plainParts.length - 1) endTagged = tagged.length

    // First chunk: include leading tags before first plain char.
    const from = p === 0 ? 0 : startTagged
    chunks.push(tagged.slice(from, endTagged).trim() || part)
    searchFrom = endPlain
  }

  return chunks.filter((c) => c.trim().length > 0)
}

/** Join sentence targets into one paragraph string for DOCX write-back. */
export function joinSentenceTargets(targets: string[]): string {
  return targets.reduce((acc, raw) => {
    const t = raw.trim()
    if (!t) return acc
    if (!acc) return t
    const needSpace = !/\s$/u.test(acc) && !/^[.,;:!?…»"'”)\]]/u.test(t)
    return acc + (needSpace ? ' ' : '') + t
  }, '')
}

export function paragraphKeyOf(storyKey: string, paraIndex: number): string {
  return `${storyKey}:${paraIndex}`
}
