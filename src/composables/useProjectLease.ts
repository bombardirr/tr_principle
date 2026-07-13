import { computed, onUnmounted, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import {
  LEASE_CHANNEL,
  LEASE_HEARTBEAT_MS,
  getTabId,
  releaseLease,
  renewLease,
  tryClaimLease,
  type LeaseBroadcast,
} from '@/storage/projectLease'

export function useProjectLease(projectId: MaybeRefOrGetter<string>) {
  const isLeader = ref(false)
  const tabId = getTabId()
  let token = ''
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let channel: BroadcastChannel | null = null
  let startedFor: string | null = null

  function broadcast(action: LeaseBroadcast['action']) {
    const id = toValue(projectId)
    channel?.postMessage({
      type: 'lease-changed',
      projectId: id,
      tabId,
      action,
    } satisfies LeaseBroadcast)
  }

  function acquire(): boolean {
    const id = toValue(projectId)
    const lease = tryClaimLease(id, tabId)
    if (!lease) {
      isLeader.value = false
      return false
    }
    const becameLeader = !isLeader.value
    token = lease.token
    isLeader.value = true
    if (becameLeader) broadcast('acquired')
    return true
  }

  function onLeaseChanged() {
    if (isLeader.value) {
      if (!renewLease(toValue(projectId), tabId, token)) {
        acquire()
      }
      return
    }
    acquire()
  }

  function onStorage(event: StorageEvent) {
    if (event.key?.startsWith('appzac-project-lease:')) {
      onLeaseChanged()
    }
  }

  function onMessage(event: MessageEvent<LeaseBroadcast>) {
    const data = event.data
    if (!data || data.type !== 'lease-changed') return
    if (data.projectId !== toValue(projectId)) return
    if (data.tabId === tabId) return
    onLeaseChanged()
  }

  function startHeartbeat() {
    stopHeartbeat()
    heartbeatTimer = setInterval(() => {
      if (isLeader.value) {
        if (!renewLease(toValue(projectId), tabId, token)) {
          acquire()
        }
      } else {
        acquire()
      }
    }, LEASE_HEARTBEAT_MS)
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  }

  function start() {
    const id = toValue(projectId)
    if (startedFor === id) return
    stop()
    startedFor = id

    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(LEASE_CHANNEL)
      channel.addEventListener('message', onMessage)
    }
    window.addEventListener('storage', onStorage)

    acquire()
    startHeartbeat()
  }

  function stop() {
    if (startedFor && isLeader.value) {
      releaseLease(startedFor, tabId, token)
      broadcast('released')
    }
    stopHeartbeat()
    window.removeEventListener('storage', onStorage)
    channel?.removeEventListener('message', onMessage)
    channel?.close()
    channel = null
    startedFor = null
    token = ''
    isLeader.value = false
  }

  watch(
    () => toValue(projectId),
    (id, prev) => {
      if (id === prev) return
      stop()
      start()
    },
  )

  onUnmounted(() => stop())

  return {
    isLeader,
    blocked: computed(() => !isLeader.value),
    start,
    stop,
  }
}
