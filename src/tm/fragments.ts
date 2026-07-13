import { TAG_RE } from '@/docx/tags'

/** Split segment source into sentence-like fragments for TM concordance. */
export function splitTmFragments(text: string): string[] {
  const plain = text.replace(TAG_RE, '').replace(/\s+/g, ' ').trim()
  if (!plain) return []

  const parts = plain
    .split(/(?<=[.?!…])\s+/u)
    .map((part) => part.trim())
    .filter(Boolean)

  return parts.length ? parts : [plain]
}
