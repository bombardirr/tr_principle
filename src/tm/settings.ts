import { getStorageAccountId, scopedKey } from '@/storage/scope'

export type TmPunctuationMode = 'strict' | 'soft'

export interface TmSettings {
  punctuationMode: TmPunctuationMode
  fuzzyMinScore: number
  enableFragments: boolean
  autoSaveToTm: boolean
}

const STORAGE_BASE = 'appzac-tm-settings'

export const TM_SETTINGS_DEFAULT: TmSettings = {
  punctuationMode: 'soft',
  fuzzyMinScore: 1,
  enableFragments: true,
  autoSaveToTm: false,
}

function storageKey(): string {
  if (!getStorageAccountId()) return STORAGE_BASE
  return scopedKey(STORAGE_BASE)
}

export function readTmSettings(): TmSettings {
  if (typeof localStorage === 'undefined') return { ...TM_SETTINGS_DEFAULT }
  try {
    const raw = localStorage.getItem(storageKey())
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
      autoSaveToTm: parsed.autoSaveToTm === true,
    }
  } catch {
    return { ...TM_SETTINGS_DEFAULT }
  }
}

export function writeTmSettings(settings: TmSettings): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(storageKey(), JSON.stringify(settings))
}
