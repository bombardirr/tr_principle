import { computed, reactive, ref } from 'vue'
import { listMembers } from '@/jobs/api'
import type { Job, JobMember } from '@/types/job'

const ACK_PREFIX = 'tr.jobJoinAck.'
const ANNOUNCED_PREFIX = 'tr.jobJoinAnnounced.'

export type JoinToast = {
  jobId: string
  jobTitle: string
  memberName: string
}

/** jobId → count of members not yet acknowledged by opening the work */
const unreadByJob = reactive<Record<string, number>>({})
const toast = ref<JoinToast | null>(null)
const toastVisible = ref(false)

let toastHideTimer: ReturnType<typeof setTimeout> | undefined
let toastClearTimer: ReturnType<typeof setTimeout> | undefined
let pollTimer: ReturnType<typeof setInterval> | undefined
let pollingUserId: string | null = null

function loadMap(key: string): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, string[]>
  } catch {
    return {}
  }
}

function saveMap(key: string, map: Record<string, string[]>) {
  localStorage.setItem(key, JSON.stringify(map))
}

function memberIds(members: JobMember[]) {
  return members.map(m => m.userId)
}

function displayName(member: JobMember) {
  return member.displayName?.trim() || `anon:${member.userId.slice(0, 8)}`
}

export const joinUnreadCount = computed(() =>
  Object.values(unreadByJob).reduce((sum, n) => sum + (n > 0 ? 1 : 0), 0),
)

export function jobHasJoinUnread(jobId: string) {
  return (unreadByJob[jobId] ?? 0) > 0
}

export function useJoinToast() {
  return { toast, toastVisible }
}

function showJoinToast(payload: JoinToast) {
  if (toastHideTimer) clearTimeout(toastHideTimer)
  if (toastClearTimer) clearTimeout(toastClearTimer)
  toast.value = payload
  toastVisible.value = false
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toastVisible.value = true
    })
  })
  toastHideTimer = setTimeout(() => {
    toastVisible.value = false
    toastClearTimer = setTimeout(() => {
      toast.value = null
    }, 320)
  }, 4200)
}

/** Acknowledge roster so the badge clears (after opening panel / hub). */
export function acknowledgeJobJoins(userId: string, jobId: string, members: JobMember[]) {
  const ackKey = ACK_PREFIX + userId
  const annKey = ANNOUNCED_PREFIX + userId
  const ack = loadMap(ackKey)
  const ann = loadMap(annKey)
  ack[jobId] = memberIds(members)
  ann[jobId] = []
  saveMap(ackKey, ack)
  saveMap(annKey, ann)
  delete unreadByJob[jobId]
}

export async function checkOwnedJobJoins(userId: string, jobs: Job[]) {
  const owned = jobs.filter(j => j.ownerUserId === userId)
  const ackKey = ACK_PREFIX + userId
  const annKey = ANNOUNCED_PREFIX + userId
  const ack = loadMap(ackKey)
  const ann = loadMap(annKey)
  let ackDirty = false
  let annDirty = false

  for (const job of owned) {
    let members: JobMember[]
    try {
      members = await listMembers(job.id)
    } catch {
      continue
    }

    const ids = memberIds(members)
    const prev = ack[job.id]
    if (!prev) {
      ack[job.id] = ids
      ackDirty = true
      delete unreadByJob[job.id]
      continue
    }

    const prevSet = new Set(prev)
    const newcomers = members.filter(m => m.role !== 'owner' && !prevSet.has(m.userId))
    unreadByJob[job.id] = newcomers.length
    if (!newcomers.length) continue

    const announced = new Set(ann[job.id] ?? [])
    let toasted = false
    for (const member of newcomers) {
      if (announced.has(member.userId)) continue
      announced.add(member.userId)
      if (!toasted) {
        showJoinToast({
          jobId: job.id,
          jobTitle: job.title,
          memberName: displayName(member),
        })
        toasted = true
      }
    }
    const nextAnn = [...announced]
    if (nextAnn.length !== (ann[job.id]?.length ?? 0)) {
      ann[job.id] = nextAnn
      annDirty = true
    }
  }

  if (ackDirty) saveMap(ackKey, ack)
  if (annDirty) saveMap(annKey, ann)
}

export function startJoinActivityPolling(userId: string, getJobs: () => Job[], intervalMs = 18000) {
  stopJoinActivityPolling()
  pollingUserId = userId
  const tick = () => {
    if (pollingUserId !== userId) return
    void checkOwnedJobJoins(userId, getJobs())
  }
  tick()
  pollTimer = setInterval(tick, intervalMs)
}

export function stopJoinActivityPolling() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = undefined
  pollingUserId = null
}
