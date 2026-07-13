import { TAG_RE } from '@/docx/tags'

function plainSource(text: string): string {
  return text.replace(TAG_RE, '').replace(/\s+/g, ' ').trim()
}

/** Split segment source into sentence-like fragments for TM concordance. */
export function splitTmFragments(text: string): string[] {
  const plain = plainSource(text)
  if (!plain) return []

  // After .?!… — with or without a space before the next sentence (Word often omits the space).
  const parts = plain
    .split(/(?<=[.?!…])(?:\s+|(?=[^\s]))/u)
    .map((part) => part.trim())
    .filter(Boolean)

  return parts.length ? parts : [plain]
}

export function isCompositeSegment(source: string): boolean {
  return splitTmFragments(source).length > 1
}

export { plainSource }
