import { TAG_RE } from '@/docx/tags'

/** Normalize segment source for TM lookup (tags stripped, case/spacing). */
export function normalizeTmSource(text: string): string {
  return text.replace(TAG_RE, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

export function tmLookupKey(
  source: string,
  sourceLang?: string,
  targetLang?: string,
): string {
  const langs = [sourceLang ?? '', targetLang ?? ''].join('|')
  return `${normalizeTmSource(source)}::${langs}`
}
