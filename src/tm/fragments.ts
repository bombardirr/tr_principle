import { TAG_RE } from '@/docx/tags'

function plainSource(text: string): string {
  return text.replace(TAG_RE, '').replace(/\s+/g, ' ').trim()
}

const DATE_TOKEN_START = '\uE000'
const DATE_TOKEN_END = '\uE001'

/**
 * Date-like spans that must not be treated as sentence boundaries.
 * Only the numeric date is protected — trailing «г.» / «года» stay outside
 * so a real sentence break after «г.» (before a capital) still works.
 */
const DATE_PATTERNS: RegExp[] = [
  // 30.03.2026 | 1.4.26
  /\b\d{1,2}\.\d{1,2}\.\d{2,4}/giu,
  // 30/03/2026 or 30-03-2026
  /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/giu,
  // 2026-03-30 (ISO)
  /\b\d{4}-\d{1,2}-\d{1,2}/giu,
]

/** Replace date spans with opaque tokens so "." inside them cannot end a sentence. */
export function protectDates(text: string): { text: string; dates: string[] } {
  const dates: string[] = []
  let out = text
  for (const re of DATE_PATTERNS) {
    out = out.replace(re, (match) => {
      const i = dates.length
      dates.push(match)
      return `${DATE_TOKEN_START}${i}${DATE_TOKEN_END}`
    })
  }
  return { text: out, dates }
}

export function restoreDates(text: string, dates: string[]): string {
  return text.replace(
    new RegExp(`${DATE_TOKEN_START}(\\d+)${DATE_TOKEN_END}`, 'g'),
    (_, i) => dates[Number(i)] ?? '',
  )
}

/** Split segment source into sentence-like fragments for TM concordance. */
export function splitTmFragments(text: string): string[] {
  const plain = plainSource(text)
  if (!plain) return []

  const { text: protectedText, dates } = protectDates(plain)

  // After .?!… split only before a following capital letter (new sentence).
  // Dates are already tokenized, so remaining "." are real sentence ends / abbreviations.
  // Also never split when a digit follows the punct (decimals).
  const parts = protectedText
    .split(/(?<=[.?!…])(?!\d)(?:\s+(?=[\p{Lu}])|(?=[\p{Lu}]))/u)
    .map((part) => restoreDates(part.trim(), dates))
    .filter(Boolean)

  return parts.length ? parts : [restoreDates(protectedText, dates)]
}

export function isCompositeSegment(source: string): boolean {
  return splitTmFragments(source).length > 1
}

export { plainSource }
