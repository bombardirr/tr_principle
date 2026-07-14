export type LangCode = 'ru' | 'en' | 'en-GB'

export interface LangPairPreset {
  id: string
  label: string
  sourceLang: LangCode
  targetLang: LangCode
}

/** MVP language pairs only — extend after MVP. */
export const LANG_PAIR_PRESETS: LangPairPreset[] = [
  { id: 'ru-en', label: 'RU → EN', sourceLang: 'ru', targetLang: 'en' },
  { id: 'en-ru', label: 'EN → RU', sourceLang: 'en', targetLang: 'ru' },
  { id: 'ru-en-GB', label: 'RU → EN/Brit', sourceLang: 'ru', targetLang: 'en-GB' },
  { id: 'en-GB-ru', label: 'EN/Brit → RU', sourceLang: 'en-GB', targetLang: 'ru' },
]

export function findLangPairPreset(
  sourceLang?: string,
  targetLang?: string,
): LangPairPreset | undefined {
  return LANG_PAIR_PRESETS.find(
    (p) => p.sourceLang === sourceLang && p.targetLang === targetLang,
  )
}

export function langPairLabel(sourceLang?: string, targetLang?: string): string {
  return findLangPairPreset(sourceLang, targetLang)?.label ?? `${sourceLang ?? '?'} → ${targetLang ?? '?'}`
}
