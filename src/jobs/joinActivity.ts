import { computed, reactive, ref } from 'vue'
import { listMembers } from '@/jobs/api'
import type { CloudProject, CloudProjectMember } from '@/types/cloudProject'

const ACK_PREFIX = 'tr.jobJoinAck.'
const ANNOUNCED_PREFIX = 'tr.jobJoinAnnounced.'

export type JoinToast = {
  projectId: string
  projectTitle: string
  memberName: string
}

/** projectId → count of members not yet acknowledged by opening the work */
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

function memberIds(members: CloudProjectMember[]) {
  return members.map(m => m.userId)
}

function displayName(member: CloudProjectMember) {
  return member.displayName?.trim() || `anon:${member.userId.slice(0, 8)}`
}

export const joinUnreadCount = computed(() =>
  Object.values(unreadByJob).reduce((sum, n) => sum + (n > 0 ? 1 : 0), 0),
)

export function projectHasJoinUnread(projectId: string) {
  return (unreadByJob[projectId] ?? 0) > 0
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
export function acknowledgeProjectJoins(
  userId: string,
  projectId: string,
  members: CloudProjectMember[],
) {
  const ackKey = ACK_PREFIX + userId
  const annKey = ANNOUNCED_PREFIX + userId
  const ack = loadMap(ackKey)
  const ann = loadMap(annKey)
  ack[projectId] = memberIds(members)
  ann[projectId] = []
  saveMap(ackKey, ack)
  saveMap(annKey, ann)
  delete unreadByJob[projectId]
}

export async function checkOwnedProjectJoins(userId: string, projects: CloudProject[]) {
  const owned = projects.filter(project => project.ownerUserId === userId)
  const ackKey = ACK_PREFIX + userId
  const annKey = ANNOUNCED_PREFIX + userId
  const ack = loadMap(ackKey)
  const ann = loadMap(annKey)
  let ackDirty = false
  let annDirty = false

  for (const project of owned) {
    let members: CloudProjectMember[]
    try {
      members = await listMembers(project.id)
    } catch {
      continue
    }

    const ids = memberIds(members)
    const prev = ack[project.id]
    if (!prev) {
      ack[project.id] = ids
      ackDirty = true
      delete unreadByJob[project.id]
      continue
    }

    const prevSet = new Set(prev)
    const newcomers = members.filter(m => m.role !== 'owner' && !prevSet.has(m.userId))
    unreadByJob[project.id] = newcomers.length
    if (!newcomers.length) continue

    const announced = new Set(ann[project.id] ?? [])
    let toasted = false
    for (const member of newcomers) {
      if (announced.has(member.userId)) continue
      announced.add(member.userId)
      if (!toasted) {
        showJoinToast({
          projectId: project.id,
          projectTitle: project.title,
          memberName: displayName(member),
        })
        toasted = true
      }
    }
    const nextAnn = [...announced]
    if (nextAnn.length !== (ann[project.id]?.length ?? 0)) {
      ann[project.id] = nextAnn
      annDirty = true
    }
  }

  if (ackDirty) saveMap(ackKey, ack)
  if (annDirty) saveMap(annKey, ann)
}

export function startJoinActivityPolling(
  userId: string,
  getProjects: () => CloudProject[],
  intervalMs = 18000,
) {
  stopJoinActivityPolling()
  pollingUserId = userId
  const tick = () => {
    if (pollingUserId !== userId) return
    void checkOwnedProjectJoins(userId, getProjects())
  }
  tick()
  pollTimer = setInterval(tick, intervalMs)
}

export function stopJoinActivityPolling() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = undefined
  pollingUserId = null
}
