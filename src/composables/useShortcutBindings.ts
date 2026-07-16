import { ref } from 'vue'
import {
  readShortcutBindings,
  writeShortcutBindings,
  SHORTCUT_DEFAULTS,
  type KeyBinding,
  type ShortcutBindings,
} from '@/shortcuts/bindings'

const bindings = ref<ShortcutBindings>(readShortcutBindings())

export function useShortcutBindings() {
  function reload() {
    bindings.value = readShortcutBindings()
  }

  function setBinding<K extends keyof ShortcutBindings>(id: K, value: KeyBinding) {
    bindings.value = { ...bindings.value, [id]: { ...value } }
    writeShortcutBindings(bindings.value)
  }

  function resetBinding<K extends keyof ShortcutBindings>(id: K) {
    setBinding(id, { ...SHORTCUT_DEFAULTS[id] })
  }

  return {
    bindings,
    reload,
    setBinding,
    resetBinding,
  }
}
