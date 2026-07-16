import { onMounted, onUnmounted, ref, type Ref } from 'vue'

export type OnlineStatus = {
  online: Ref<boolean>
}

function readOnline(): boolean {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine !== false
}

/** Reactive online/offline from `navigator.onLine` + window events. */
export function useOnlineStatus(): OnlineStatus {
  const online = ref(readOnline())

  function sync() {
    online.value = readOnline()
  }

  onMounted(() => {
    sync()
    window.addEventListener('online', sync)
    window.addEventListener('offline', sync)
  })

  onUnmounted(() => {
    window.removeEventListener('online', sync)
    window.removeEventListener('offline', sync)
  })

  return { online }
}
