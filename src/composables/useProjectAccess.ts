import { computed, onUnmounted, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { ApiError } from '@/auth/api'
import { claimProjectLock, releaseProjectLock } from '@/projects/api'
import { useProjectLease } from '@/composables/useProjectLease'
import { getTabId } from '@/storage/projectLease'

const CLOUD_HEARTBEAT_MS = 10_000

/**
 * Tab lease (same browser) + cloud lock (cross-device).
 * Writes require both; network errors skip cloud (offline-friendly).
 */
export function useProjectAccess(projectId: MaybeRefOrGetter<string>) {
  const tab = useProjectLease(projectId)
  const cloudOk = ref(true)
  const cloudBusy = ref(false)
  const cloudToken = ref('')
  let cloudTimer: ReturnType<typeof setInterval> | null = null
  let startedFor: string | null = null
  const holderId = getTabId()

  async function claimCloud(): Promise<void> {
    const id = toValue(projectId)
    try {
      const res = await claimProjectLock(id, holderId, cloudToken.value || undefined)
      cloudToken.value = res.token
      cloudOk.value = true
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403 || e.status === 409)) {
        cloudOk.value = false
        cloudToken.value = ''
        return
      }
      // Offline / server down: do not block editing.
      cloudOk.value = true
    }
  }

  async function releaseCloud(): Promise<void> {
    if (!startedFor || !cloudToken.value) return
    try {
      await releaseProjectLock(startedFor, holderId, cloudToken.value)
    } catch {
      /* ignore */
    }
    cloudToken.value = ''
  }

  function stopCloudHeartbeat() {
    if (cloudTimer) {
      clearInterval(cloudTimer)
      cloudTimer = null
    }
  }

  function startCloudHeartbeat() {
    stopCloudHeartbeat()
    cloudTimer = setInterval(() => {
      if (tab.isLeader.value) {
        void claimCloud()
      }
    }, CLOUD_HEARTBEAT_MS)
  }

  async function start() {
    const id = toValue(projectId)
    if (startedFor === id) return
    await stop()
    startedFor = id
    tab.start()
    cloudBusy.value = true
    try {
      if (tab.isLeader.value) {
        await claimCloud()
      } else {
        cloudOk.value = true
      }
      startCloudHeartbeat()
    } finally {
      cloudBusy.value = false
    }
  }

  async function stop() {
    stopCloudHeartbeat()
    if (startedFor) {
      await releaseCloud()
    }
    tab.stop()
    startedFor = null
    cloudOk.value = true
  }

  watch(
    () => tab.isLeader.value,
    leader => {
      if (!startedFor) return
      if (leader) void claimCloud()
      else
        void releaseCloud().then(() => {
          cloudOk.value = true
        })
    }
  )

  watch(
    () => toValue(projectId),
    (id, prev) => {
      if (id === prev) return
      void stop().then(() => start())
    }
  )

  onUnmounted(() => {
    void stop()
  })

  const blocked = computed(() => tab.blocked.value || !cloudOk.value)
  const isLeader = computed(() => tab.isLeader.value && cloudOk.value)

  return {
    isLeader,
    blocked,
    cloudOk,
    cloudToken,
    holderId,
    tabLeader: tab.isLeader,
    start,
    stop,
  }
}
