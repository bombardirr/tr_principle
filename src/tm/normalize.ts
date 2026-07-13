import { TAG_RE } from '@/docx/tags'
import type { TmPunctuationMode } from './settings'

const TRAILING_PUNCT_RE = /[.,;:!?…]+$/u

/** Normalize segment source for TM lookup (tags stripped, case/spacing). */
export function normalizeTmSource(text: string): string {
  return text.replace(TAG_RE, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

/** Match-oriented normalize; soft mode ignores trailing punctuation. */
export function normalizeTmForMatch(
  text: string,
  mode: TmPunctuationMode = 'strict',
): string {
  let normalized = normalizeTmSource(text)
  if (mode === 'soft') {
    normalized = normalized.replace(TRAILING_PUNCT_RE, '')
  }
  return normalized
}

export function tmLookupKey(
  source: string,
  sourceLang?: string,
  targetLang?: string,
): string {
  const langs = [sourceLang ?? '', targetLang ?? ''].join('|')
  return `${normalizeTmSource(source)}::${langs}`
}
