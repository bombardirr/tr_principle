import {
  findLangPairPreset,
  LANG_PAIR_PRESETS,
  type LangPairPreset,
} from '@/tm/langPairs'

const STORAGE_KEY = 'job-lang-pair-preset'
const DEFAULT_PRESET_ID = 'ru-en'

export function loadJobLangPairPresetId(): string {
  if (typeof localStorage === 'undefined') return DEFAULT_PRESET_ID
  const raw = localStorage.getItem(STORAGE_KEY)
  if (raw && LANG_PAIR_PRESETS.some(preset => preset.id === raw)) return raw
  return DEFAULT_PRESET_ID
}

export function saveJobLangPairPresetId(id: string) {
  if (typeof localStorage === 'undefined') return
  if (LANG_PAIR_PRESETS.some(preset => preset.id === id)) {
    localStorage.setItem(STORAGE_KEY, id)
  }
}

export function loadJobLangPairPreset(): LangPairPreset {
  const id = loadJobLangPairPresetId()
  return LANG_PAIR_PRESETS.find(preset => preset.id === id) ?? LANG_PAIR_PRESETS[0]!
}

export function saveJobLangPairFromCodes(sourceLang?: string, targetLang?: string) {
  const preset = findLangPairPreset(sourceLang, targetLang)
  if (preset) saveJobLangPairPresetId(preset.id)
}
