export type TmPunctuationMode = 'strict' | 'soft'

export interface TmSettings {
  punctuationMode: TmPunctuationMode
  fuzzyMinScore: number
  enableFragments: boolean
  autoSaveToTm: boolean
}

const STORAGE_KEY = 'appzac-tm-settings'

export const TM_SETTINGS_DEFAULT: TmSettings = {
  punctuationMode: 'soft',
  fuzzyMinScore: 0.85,
  enableFragments: true,
  autoSaveToTm: true,
}

export function readTmSettings(): TmSettings {
  if (typeof localStorage === 'undefined') return { ...TM_SETTINGS_DEFAULT }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...TM_SETTINGS_DEFAULT }
    const parsed = JSON.parse(raw) as Partial<TmSettings>
    return {
      punctuationMode:
        parsed.punctuationMode === 'strict' ? 'strict' : 'soft',
      fuzzyMinScore:
        typeof parsed.fuzzyMinScore === 'number' &&
        parsed.fuzzyMinScore >= 0.5 &&
        parsed.fuzzyMinScore <= 1
          ? parsed.fuzzyMinScore
          : TM_SETTINGS_DEFAULT.fuzzyMinScore,
      enableFragments: parsed.enableFragments !== false,
      autoSaveToTm: parsed.autoSaveToTm !== false,
    }
  } catch {
    return { ...TM_SETTINGS_DEFAULT }
  }
}

export function writeTmSettings(settings: TmSettings): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}
