import { ref } from 'vue'
import {
  readTmSettings,
  writeTmSettings,
  type TmSettings,
} from '@/tm/settings'

const settings = ref<TmSettings>(readTmSettings())

export function useTmSettings() {
  function reload() {
    settings.value = readTmSettings()
  }

  function togglePunctuationMode() {
    settings.value = {
      ...settings.value,
      punctuationMode:
        settings.value.punctuationMode === 'soft' ? 'strict' : 'soft',
    }
    writeTmSettings(settings.value)
  }

  return {
    settings,
    reload,
    togglePunctuationMode,
  }
}
