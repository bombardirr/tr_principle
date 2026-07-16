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

  function toggleAutoSaveToTm() {
    settings.value = {
      ...settings.value,
      autoSaveToTm: !settings.value.autoSaveToTm,
    }
    writeTmSettings(settings.value)
  }

  return {
    settings,
    reload,
    toggleAutoSaveToTm,
  }
}
