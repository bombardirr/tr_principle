import { TAG_RE } from '@/docx/tags'

function plainSource(text: string): string {
  return text.replace(TAG_RE, '').replace(/\s+/g, ' ').trim()
}

const DATE_TOKEN_START = '\uE000'
const DATE_TOKEN_END = '\uE001'

/** Genitive month names + common abbreviations (period optional). */
const RU_MONTH =
  '(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря|янв\\.?|февр?\\.?|мар\\.?|апр\\.?|июн\\.?|июл\\.?|авг\\.?|сент?\\.?|окт\\.?|нояб?\\.?|дек\\.?)'

const EN_MONTH =
  '(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan\\.?|Feb\\.?|Mar\\.?|Apr\\.?|Jun\\.?|Jul\\.?|Aug\\.?|Sept?\\.?|Oct\\.?|Nov\\.?|Dec\\.?)'

const DAY = '(?:\\d{1,2})'
const DAY_ORD = '(?:\\d{1,2}(?:st|nd|rd|th)?)'
const YEAR = '(?:\\d{4}|\\d{2})'

/**
 * Date-like spans that must not be treated as sentence boundaries.
 * Longer / wordy forms first; numeric dotted dates last among relatives.
 * Trailing «г.» / «года» stay outside so «г. Далее» can still start a sentence.
 */
const DATE_PATTERNS: RegExp[] = [
  // 30 March 2026 | 30th of March 2026
  new RegExp(`\\b${DAY_ORD}(?:\\s+of)?\\s+${EN_MONTH}\\s+${YEAR}`, 'giu'),
  // March 30, 2026 | Mar. 30th, 2026
  new RegExp(`\\b${EN_MONTH}\\s+${DAY_ORD},?\\s+${YEAR}`, 'giu'),
  // 30 марта 2026 | 30 мар. 2026
  new RegExp(`\\b${DAY}\\s+${RU_MONTH}\\s+${YEAR}`, 'giu'),
  // 30.03.2026 | 1.4.26
  /\b\d{1,2}\.\d{1,2}\.\d{2,4}/giu,
  // 30/03/2026 | 30-03-2026 | 03/30/2026
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
