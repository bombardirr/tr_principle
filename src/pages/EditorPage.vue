<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import MarqueeText from '@/components/MarqueeText.vue'
import ProjectSettingsDialog from '@/components/ProjectSettingsDialog.vue'
import ResegmentDialog from '@/components/ResegmentDialog.vue'
import ShareProjectDialog from '@/components/ShareProjectDialog.vue'
import CreateSharedWorkDialog from '@/components/CreateSharedWorkDialog.vue'
import SharedWorkPanel from '@/components/SharedWorkPanel.vue'
import DocxPreviewPanel from '@/components/DocxPreviewPanel.vue'
import GlossaryPanel from '@/components/GlossaryPanel.vue'
import { buildTranslatedDocx, downloadBlob } from '@/docx/exportDocx'
import { openDocx, DocxError } from '@/docx/openDocx'
import { getProject, saveProject } from '@/storage/idb'
import { readEditorScroll, restoreWindowScroll, writeEditorScroll } from '@/storage/editorScroll'
import { packProjectFile, unpackProjectFile } from '@/storage/projectFile'
import IconButton from '@/components/IconButton.vue'
import EditorGlyph from '@/components/EditorGlyph.vue'
import TooltipWrap from '@/components/TooltipWrap.vue'
import { publicActorLabel, useAuth } from '@/auth/session'
import { useProjectAccess } from '@/composables/useProjectAccess'
import { withSegmentAudit } from '@/utils/segmentAudit'
import { scheduleProjectBackup, pushProjectBackup } from '@/projects/backup'
import { useTmSettings } from '@/composables/useTmSettings'
import { useShortcutBindings } from '@/composables/useShortcutBindings'
import { matchesBinding } from '@/shortcuts/bindings'
import { useSegmentHistory } from '@/composables/useSegmentHistory'
import { readPreviewEnabled, writePreviewEnabled } from '@/editor/previewPreference'
import { findTmMatches } from '@/tm/match'
import { findLangPairPreset, langPairLabel } from '@/tm/langPairs'
import { tmLookupKey } from '@/tm/normalize'
import { canReadPersonalTm, canWritePersonalTm } from '@/tm/projectAttachments'
import { TM_COLLECTION_CHANGED_EVENT } from '@/tm/tmCollectionEvents'
import { projectNeedsResegment, resegmentProjectRecord } from '@/tm/resegment'
import { exportTmx, parseTmx } from '@/tm/tmx'
import {
  listTmUnits,
  recordDoneSegmentsInTm,
  importTmUnits,
  deleteTmForSegmentSource,
} from '@/storage/tmIdb'
import { markTmDirty } from '@/tm/sync'
import { listGlossaryTerms } from '@/storage/glossaryIdb'
import type { GlossaryTerm } from '@/types/glossary'
import {
  countTranslatedSegments,
  finalizeSegmentStatus,
  isIntentionallyEmpty,
  normalizeSegmentStatus,
} from '@/utils/segmentStatus'
import type { ProjectRecord, Segment, TargetStyleRange } from '@/types/project'
import { SEGMENT_SCHEMA_DATE_SAFE } from '@/types/project'
import type { TmMatch, TmUnit } from '@/types/tm'
import { stripMarkers } from '@/docx/tags'
import {
  applyStyleRange,
  collectProjectFonts,
  effectiveTargetStyles,
  predominantSourceStyle,
  selectionHasProp,
  selectionUniformValue,
  targetStylesFromTaggedSource,
  type StyleApplyPatch,
} from '@/docx/runStyle'
import { pickMagnetRowId } from '@/editor/magnetGeometry'
import MagneticSegmentRail from '@/components/MagneticSegmentRail.vue'
import ParagraphBlock from '@/components/ParagraphBlock.vue'
import { bindProjectToJob } from '@/jobs/localProject'
import { listMembers, getJob } from '@/jobs/api'
import {
  acknowledgeJobJoins,
  jobHasJoinUnread,
  startJoinActivityPolling,
  stopJoinActivityPolling,
} from '@/jobs/joinActivity'
import type { Job, JobRole } from '@/types/job'
import { reportJobMemberProgress } from '@/jobs/reportProgress'
import { fingerprintDocx, fingerprintMismatch } from '@/jobs/fingerprint'

const props = defineProps<{ id: string }>()
const { t } = useI18n()
const router = useRouter()
const { user } = useAuth()

/** shallowRef: deep ref() proxies break IndexedDB structured clone */
const record = shallowRef<ProjectRecord | null>(null)
const error = ref('')
const notice = ref('')
const saving = ref(false)
const allSaved = ref(true)
let saveTimer: ReturnType<typeof setTimeout> | null = null
let loadGen = 0

const SAVE_IDLE_MS = 3000
const UNDO_SAVE_IDLE_MS = 1500
const segHistory = useSegmentHistory()

const previewEnabled = ref(readPreviewEnabled())
const previewToken = ref(0)
let previewTimer: ReturnType<typeof setTimeout> | null = null
const PREVIEW_OVERLAY_MQ = '(max-width: 1280px)'
const previewOverlayMode = ref(
  typeof window !== 'undefined' ? window.matchMedia(PREVIEW_OVERLAY_MQ).matches : false,
)
const previewAsOverlay = computed(() => previewEnabled.value && previewOverlayMode.value)
let pageScrollSaveTimer: ReturnType<typeof setTimeout> | null = null
const activeSegmentId = ref<string | null>(null)
const projectLease = useProjectAccess(() => props.id)
const { settings: tmSettings, toggleAutoSaveToTm } = useTmSettings()
const { bindings: shortcutBindings, reload: reloadShortcuts } = useShortcutBindings()
const tmUnits = shallowRef<TmUnit[]>([])
const jobRole = ref<JobRole | null>(null)
const glossaryTerms = shallowRef<GlossaryTerm[]>([])
const glossaryOpen = ref(false)
const tmImportInput = ref<HTMLInputElement | null>(null)
/** Segment ids changed while TM autosave is on — written on next persist only. */
const tmAutosaveIds = ref(new Set<string>())

function markTmAutosave(segId: string) {
  if (!tmSettings.value.autoSaveToTm || !personalTmWritable.value) return
  const next = new Set(tmAutosaveIds.value)
  next.add(segId)
  tmAutosaveIds.value = next
}

function clearTmAutosave(segId: string) {
  if (!tmAutosaveIds.value.has(segId)) return
  const next = new Set(tmAutosaveIds.value)
  next.delete(segId)
  tmAutosaveIds.value = next
}

const done = computed(() => (record.value ? countTranslatedSegments(record.value.segments) : 0))
const total = computed(() => record.value?.segments.length ?? 0)
const editorReadOnly = computed(() => projectLease.blocked.value || jobRole.value === 'viewer')
const personalTmReadable = computed(() =>
  record.value ? canReadPersonalTm(record.value.meta) : false
)
const personalTmWritable = computed(() =>
  record.value ? canWritePersonalTm(record.value.meta) : false
)
const matchTmUnits = computed(() => (personalTmReadable.value ? tmUnits.value : []))

const tmCoveragePct = computed(() => {
  if (!record.value?.segments.length) return 0
  const opts = tmMatchOptions()
  let hit = 0
  for (const seg of record.value.segments) {
    if (
      findTmMatches(
        matchTmUnits.value,
        seg.source,
        record.value.meta.sourceLang,
        record.value.meta.targetLang,
        { ...opts, ...segmentNeighbors(seg) }
      ).length
    ) {
      hit++
    }
  }
  return Math.round((hit / record.value.segments.length) * 100)
})

const donePct = computed(() => (total.value ? Math.round((done.value / total.value) * 100) : 0))

const langPairTitle = computed(() => {
  const meta = record.value?.meta
  if (
    !meta?.sourceLang ||
    !meta?.targetLang ||
    !findLangPairPreset(meta.sourceLang, meta.targetLang)
  ) {
    return t('editor.langPairChoose')
  }
  return langPairLabel(meta.sourceLang, meta.targetLang)
})

const needsProjectSettings = computed(() => {
  const meta = record.value?.meta
  if (!meta) return false
  if (!meta.settingsConfirmedAt) return true
  if (!meta.sourceLang || !meta.targetLang) return true
  return !findLangPairPreset(meta.sourceLang, meta.targetLang)
})

const settingsOpen = ref(false)
const settingsMode = ref<'first' | 'edit'>('first')
const resegmentOpen = ref(false)
const shareOpen = ref(false)
const sharedCreateOpen = ref(false)
const sharedPanelOpen = ref(false)
const editorOwnedJob = ref<Job | null>(null)
const sharedJoinUnread = computed(() => {
  const jobId = record.value?.meta.jobId
  return Boolean(jobId && jobHasJoinUnread(jobId))
})
const emptyDocxInput = ref<HTMLInputElement | null>(null)
const emptyProjectInput = ref<HTMLInputElement | null>(null)
const emptyBusy = ref(false)
const resegmentDeferred = ref(false)
const thresholdOpen = ref(false)

const needsResegment = computed(() =>
  projectNeedsResegment(record.value?.meta, record.value?.segments)
)

const thresholdPct = computed(() => {
  const score = record.value?.meta.fuzzyMinScore ?? tmSettings.value.fuzzyMinScore ?? 0.75
  return Math.round(score * 100)
})

function toggleThresholdSlider() {
  thresholdOpen.value = !thresholdOpen.value
}

function setThresholdPct(pct: number) {
  if (!record.value || editorReadOnly.value) return
  const clamped = Math.min(100, Math.max(50, pct))
  record.value = {
    ...record.value,
    meta: {
      ...record.value.meta,
      fuzzyMinScore: clamped / 100,
    },
  }
}

function onThresholdInput(event: Event) {
  const raw = Number((event.target as HTMLInputElement).value)
  setThresholdPct(Number.isFinite(raw) ? raw : 100)
}

/** Persist threshold quietly — not through text autosave UX. */
async function onThresholdChange(event: Event) {
  onThresholdInput(event)
  if (!record.value || editorReadOnly.value) return
  try {
    await saveProject(record.value)
  } catch (e) {
    setSaveError(e)
  }
}

watch(
  () => props.id,
  () => {
    resegmentDeferred.value = false
  }
)

watch(
  () =>
    [
      record.value?.meta.id,
      needsResegment.value,
      resegmentDeferred.value,
      needsProjectSettings.value,
    ] as const,
  () => {
    if (needsResegment.value && !resegmentDeferred.value) {
      resegmentOpen.value = true
      settingsOpen.value = false
      return
    }
    resegmentOpen.value = false
    if (needsProjectSettings.value) {
      settingsMode.value = 'first'
      settingsOpen.value = true
    }
  },
  { immediate: true }
)

function openProjectSettings() {
  if (editorReadOnly.value) return
  settingsMode.value = needsProjectSettings.value ? 'first' : 'edit'
  settingsOpen.value = true
}

function closeProjectSettings() {
  if (settingsMode.value === 'first' && needsProjectSettings.value) return
  settingsOpen.value = false
}

function saveProjectSettings(payload: {
  sourceLang: string
  targetLang: string
  fuzzyMinScore: number
}) {
  if (!record.value || editorReadOnly.value) return
  record.value = {
    ...record.value,
    meta: {
      ...record.value.meta,
      sourceLang: payload.sourceLang,
      targetLang: payload.targetLang,
      fuzzyMinScore: payload.fuzzyMinScore,
      settingsConfirmedAt: new Date().toISOString(),
    },
  }
  settingsOpen.value = false
  scheduleSave()
}

function deferResegment() {
  resegmentDeferred.value = true
  resegmentOpen.value = false
}

async function confirmResegment() {
  if (!record.value || editorReadOnly.value) return
  const { segments, ambiguousCount } = await resegmentProjectRecord(record.value)
  record.value = {
    ...record.value,
    meta: {
      ...record.value.meta,
      segmentSchemaVersion: SEGMENT_SCHEMA_DATE_SAFE,
      segmentCount: segments.length,
    },
    segments,
  }
  resegmentOpen.value = false
  resegmentDeferred.value = false
  if (ambiguousCount > 0) {
    notice.value = t('editor.resegmentAmbiguous', { n: ambiguousCount })
  }
  scheduleSave()
}

const displayName = computed(() => {
  const name = record.value?.meta.name ?? ''
  return name.replace(/\.docx$/i, '') || name
})

const progressTitle = computed(() => t('editor.progress', { done: done.value, total: total.value }))

const saveStatusTitle = computed(() => {
  if (saving.value) return t('editor.saving')
  if (allSaved.value) return t('editor.autosaved')
  return t('editor.unsavedPending')
})

const savePhase = computed(() => {
  if (saving.value) return 'saving'
  if (allSaved.value) return 'saved'
  return 'pending'
})

function normalizeStatuses(segments: Segment[]): Segment[] {
  return segments.map(s => ({
    ...s,
    status: normalizeSegmentStatus(s),
  }))
}

function withNormalizedRecord(rec: ProjectRecord): ProjectRecord {
  return {
    meta: rec.meta,
    docx: rec.docx,
    segments: normalizeStatuses(rec.segments),
  }
}

function clearSaveTimer() {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
}

function setSaveError(e: unknown) {
  if (e instanceof Error && e.message === 'QUOTA') {
    error.value = t('projects.quota')
  } else {
    error.value = e instanceof Error ? e.message : String(e)
  }
}

async function reloadJobMembership(jobId = record.value?.meta.jobId) {
  jobRole.value = null
  if (!jobId || !user.value) return
  try {
    const members = await listMembers(jobId)
    jobRole.value = members.find(member => member.userId === user.value?.id)?.role ?? null
  } catch {
    // Keep the local project available if membership cannot be refreshed.
  }
}

async function reportJobProgress() {
  const jobId = record.value?.meta.jobId
  if (!jobId || jobRole.value === 'viewer' || !record.value) return
  await reportJobMemberProgress(jobId, record.value)
}

async function persistNow(): Promise<void> {
  if (!record.value || editorReadOnly.value) return
  clearSaveTimer()

  const segments = record.value.segments.map(s => ({
    ...s,
    status: finalizeSegmentStatus(s),
  }))
  record.value = {
    meta: record.value.meta,
    segments,
    docx: record.value.docx,
  }

  await saveProject(record.value)
  await reportJobProgress()
  if (projectLease.isLeader.value) {
    scheduleProjectBackup(record.value)
  }
  if (personalTmWritable.value && tmSettings.value.autoSaveToTm && tmAutosaveIds.value.size) {
    const onlyIds = [...tmAutosaveIds.value]
    const tmOptions = {
      sourceLang: record.value.meta.sourceLang,
      targetLang: record.value.meta.targetLang,
      projectId: record.value.meta.id,
      actor: publicActorLabel(user.value),
      onlyIds,
    }
    const dirty = await recordDoneSegmentsInTm(record.value.segments, {
      ...tmOptions,
    })
    markTmDirty(...dirty)
    tmUnits.value = personalTmReadable.value ? await listTmUnits() : []
    tmAutosaveIds.value = new Set()
  }
  allSaved.value = true
  error.value = ''
}

async function persistScroll() {
  writeEditorScroll(props.id, {
    pageY: window.scrollY,
    activeSegmentId: activeSegmentId.value,
  })
}

function scheduleScrollPersist() {
  if (pageScrollSaveTimer) clearTimeout(pageScrollSaveTimer)
  pageScrollSaveTimer = setTimeout(() => {
    void persistScroll()
  }, 200)
}

function onPageScroll() {
  scheduleScrollPersist()
}

function isSegmentInViewport(el: Element): boolean {
  const r = el.getBoundingClientRect()
  const vh = window.innerHeight || document.documentElement.clientHeight
  // Partially visible counts; fully off-screen → scroll to it.
  return r.bottom > 0 && r.top < vh
}

async function restorePageScroll() {
  const snap = readEditorScroll(props.id)
  if (!snap) return
  const focusId =
    snap.activeSegmentId && record.value?.segments.some(s => s.id === snap.activeSegmentId)
      ? snap.activeSegmentId
      : null
  if (focusId) activeSegmentId.value = focusId
  await nextTick()
  restoreWindowScroll(snap.pageY)
  window.setTimeout(() => {
    restoreWindowScroll(snap.pageY)
  }, 150)
  if (!focusId) return
  // After layout + scroll restore settle: if focus row is off-screen, bring it in.
  window.setTimeout(() => {
    const el = document.getElementById(`segment-${focusId}`)
    if (!el || isSegmentInViewport(el)) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, 400)
}

async function load() {
  const gen = ++loadGen
  error.value = ''
  allSaved.value = true
  const found = await getProject(props.id)
  if (gen !== loadGen) return
  if (!found) {
    error.value = t('editor.projectNotFound')
    record.value = null
    return
  }
  let loaded = withNormalizedRecord(found)
  if (gen !== loadGen) return
  record.value = loaded
  tmUnits.value = canReadPersonalTm(loaded.meta) ? await listTmUnits() : []
  if (gen !== loadGen) return
  await reloadJobMembership(loaded.meta.jobId)
  if (gen !== loadGen) return
  const emptyNoticeKey = `tr.emptyDocNotice:${props.id}`
  if (!loaded.segments.length && sessionStorage.getItem(emptyNoticeKey)) {
    notice.value = t('projects.emptyDoc')
    sessionStorage.removeItem(emptyNoticeKey)
  }
  await restorePageScroll()
  await nextTick()
}

async function onTmCollectionChanged() {
  const projectId = props.id
  const found = await getProject(projectId)
  if (!found || !record.value || record.value.meta.id !== projectId) return

  record.value = {
    ...record.value,
    meta: found.meta,
  }
  if (!canReadPersonalTm(found.meta)) {
    tmUnits.value = []
    tmAutosaveIds.value = new Set()
    return
  }
  tmUnits.value = await listTmUnits()
}

function onBeforeUnload(e: BeforeUnloadEvent) {
  void persistScroll()
  if (!allSaved.value) e.preventDefault()
}

const PAGE_SCROLL_OPTS: AddEventListenerOptions = { passive: true }

onMounted(() => {
  projectLease.start()
  void load()
  void reloadGlossary()
  window.addEventListener('scroll', onPageScroll, PAGE_SCROLL_OPTS)
  window.addEventListener('beforeunload', onBeforeUnload)
  window.addEventListener('keydown', onClearFocusKey)
  window.addEventListener(TM_COLLECTION_CHANGED_EVENT, onTmCollectionChanged)
  chromeMq = window.matchMedia('(max-width: 800px)')
  onChromeMq()
  chromeMq.addEventListener('change', onChromeMq)
  previewOverlayMq = window.matchMedia(PREVIEW_OVERLAY_MQ)
  onPreviewOverlayMq()
  previewOverlayMq.addEventListener('change', onPreviewOverlayMq)
  window.addEventListener('keydown', onPreviewOverlayKey)
  reloadShortcuts()
})

watch(
  () => props.id,
  () => {
    void load()
  }
)

watch(
  () => [record.value?.meta.jobId, user.value?.id] as const,
  async ([jobId, userId]) => {
    stopJoinActivityPolling()
    editorOwnedJob.value = null
    if (!jobId || !userId) return
    try {
      const job = await getJob(jobId)
      if (job.ownerUserId !== userId) return
      editorOwnedJob.value = job
      startJoinActivityPolling(userId, () => (editorOwnedJob.value ? [editorOwnedJob.value] : []))
    } catch {
      // Join badges are best-effort while editing offline.
    }
  },
  { immediate: true },
)

watch(sharedPanelOpen, async open => {
  const jobId = record.value?.meta.jobId
  const userId = user.value?.id
  if (!open || !jobId || !userId) return
  try {
    const members = await listMembers(jobId)
    acknowledgeJobJoins(userId, jobId, members)
  } catch {
    // Opening the panel still works without clearing the badge.
  }
})

onUnmounted(() => {
  stopJoinActivityPolling()
  window.removeEventListener('scroll', onPageScroll, PAGE_SCROLL_OPTS)
  window.removeEventListener('beforeunload', onBeforeUnload)
  window.removeEventListener('keydown', onClearFocusKey)
  window.removeEventListener(TM_COLLECTION_CHANGED_EVENT, onTmCollectionChanged)
  chromeMq?.removeEventListener('change', onChromeMq)
  chromeMq = null
  previewOverlayMq?.removeEventListener('change', onPreviewOverlayMq)
  previewOverlayMq = null
  window.removeEventListener('keydown', onPreviewOverlayKey)
  document.body.style.removeProperty('overflow')
  if (pageScrollSaveTimer) clearTimeout(pageScrollSaveTimer)
  void persistScroll()
  clearSaveTimer()
  if (previewTimer) clearTimeout(previewTimer)
  if (record.value && !allSaved.value && projectLease.isLeader.value) {
    void saveProject(record.value).catch(() => {})
  }
})

/** Replace a segment immutably so shallowRef children re-render. */
function patchSegment(segId: string, patch: Partial<Segment>) {
  if (!record.value || editorReadOnly.value) return
  const segments = record.value.segments.map(s => (s.id === segId ? { ...s, ...patch } : s))
  record.value = {
    meta: record.value.meta,
    segments,
    docx: record.value.docx,
  }
}

function scheduleSave(idleMs = SAVE_IDLE_MS) {
  if (!record.value || editorReadOnly.value) return
  allSaved.value = false
  notice.value = ''
  clearSaveTimer()
  saveTimer = setTimeout(async () => {
    if (!record.value) return
    saving.value = true
    try {
      await persistNow()
    } catch (e) {
      setSaveError(e)
    } finally {
      saving.value = false
    }
  }, idleMs)
}

function editActor() {
  return publicActorLabel(user.value)
}

function updateTarget(seg: Segment, value: string, styles?: Segment['targetStyles']) {
  if (!record.value || editorReadOnly.value) return
  notice.value = ''
  segHistory.seed(seg)
  const by = editActor()
  patchSegment(seg.id, {
    target: value,
    ...(styles !== undefined ? { targetStyles: styles } : {}),
    status: value.trim() ? 'draft' : seg.status === 'done' ? 'draft' : 'empty',
    tmSavePending: false,
    origin: 'manual',
    updatedBy: by,
    updatedAt: new Date().toISOString(),
    ...withSegmentAudit(seg, {
      action: 'manual',
      by,
      before: seg.target,
      after: value,
    }),
  })
  const after = record.value?.segments.find(s => s.id === seg.id)
  if (after) segHistory.commit(after, { coalesce: true })
  markTmAutosave(seg.id)
  scheduleSave()
}

function updateTargetById(segId: string, value: string, styles?: Segment['targetStyles']) {
  const seg = record.value?.segments.find(s => s.id === segId)
  if (seg) updateTarget(seg, value, styles)
}

function copySource(seg: Segment) {
  if (!record.value || editorReadOnly.value) return
  notice.value = ''
  segHistory.seed(seg)
  const by = editActor()
  const plain = stripMarkers(seg.source)
  const spans = seg.paragraphSpans?.length ? seg.paragraphSpans : seg.spans
  const targetStyles = targetStylesFromTaggedSource(seg.source, spans)
  patchSegment(seg.id, {
    target: plain,
    targetStyles,
    status: 'draft',
    tmSavePending: false,
    origin: 'copy-source',
    updatedBy: by,
    updatedAt: new Date().toISOString(),
    ...withSegmentAudit(seg, {
      action: 'copy-source',
      by,
      before: seg.target,
      after: plain,
    }),
  })
  const after = record.value?.segments.find(s => s.id === seg.id)
  if (after) segHistory.commit(after)
  markTmAutosave(seg.id)
  scheduleSave()
}

function copySourceById(segId: string) {
  const seg = record.value?.segments.find(s => s.id === segId)
  if (seg) copySource(seg)
}

function leaveEmpty(seg: Segment) {
  if (!record.value || editorReadOnly.value) return
  notice.value = ''
  clearTmAutosave(seg.id)
  segHistory.seed(seg)
  const by = editActor()
  patchSegment(seg.id, {
    target: '',
    targetStyles: [],
    status: 'done',
    tmSavePending: false,
    origin: 'leave-empty',
    updatedBy: by,
    updatedAt: new Date().toISOString(),
    ...withSegmentAudit(seg, {
      action: 'leave-empty',
      by,
      before: seg.target,
      after: '',
    }),
  })
  const after = record.value?.segments.find(s => s.id === seg.id)
  if (after) segHistory.commit(after)
  scheduleSave()
}

function leaveEmptyById(segId: string) {
  const seg = record.value?.segments.find(s => s.id === segId)
  if (seg) leaveEmpty(seg)
}

function resetTarget(seg: Segment) {
  if (!record.value || editorReadOnly.value) return
  notice.value = ''
  clearTmAutosave(seg.id)
  segHistory.seed(seg)
  const by = editActor()
  patchSegment(seg.id, {
    target: '',
    targetStyles: [],
    status: 'empty',
    tmSavePending: false,
    origin: 'reset',
    updatedBy: by,
    updatedAt: new Date().toISOString(),
    ...withSegmentAudit(seg, {
      action: 'reset',
      by,
      before: seg.target,
      after: '',
    }),
  })
  const after = record.value?.segments.find(s => s.id === seg.id)
  if (after) segHistory.commit(after)
  void removeSegmentFromTm(seg)
  scheduleSave()
}

function resetTargetById(segId: string) {
  const seg = record.value?.segments.find(s => s.id === segId)
  if (seg) resetTarget(seg)
}

async function removeSegmentFromTm(seg: Segment) {
  if (!record.value || !personalTmWritable.value) return
  try {
    const dirty = await deleteTmForSegmentSource(seg.source, {
      sourceLang: record.value.meta.sourceLang,
      targetLang: record.value.meta.targetLang,
    })
    markTmDirty(...dirty)
    tmUnits.value = await listTmUnits()
  } catch (e) {
    setSaveError(e)
  }
}

function tmMatchOptions() {
  return {
    punctuationMode: tmSettings.value.punctuationMode,
    fuzzyMinScore: record.value?.meta.fuzzyMinScore ?? tmSettings.value.fuzzyMinScore,
    enableFragments: false,
  }
}

/** Prev/next segment sources (document order) — used for 101% context match. */
function segmentNeighbors(seg: Segment): {
  contextBefore?: string
  contextAfter?: string
} {
  if (!record.value) return {}
  const segs = record.value.segments
  const i = segs.findIndex(s => s.id === seg.id)
  if (i < 0) return {}
  return {
    contextBefore: segs[i - 1]?.source,
    contextAfter: segs[i + 1]?.source,
  }
}

function matchesFor(seg: Segment): TmMatch[] {
  if (!record.value) return []
  return findTmMatches(
    matchTmUnits.value,
    seg.source,
    record.value.meta.sourceLang,
    record.value.meta.targetLang,
    { ...tmMatchOptions(), ...segmentNeighbors(seg) }
  )
}

/** Show “save to TM” only when target is non-empty and not already stored for this source. */
function needsTmSave(seg: Segment): boolean {
  if (!record.value || !personalTmWritable.value || !seg.target.trim()) return false
  const key = tmLookupKey(seg.source, record.value.meta.sourceLang, record.value.meta.targetLang)
  return !matchTmUnits.value.some(u => u.sourceKey === key && u.target === seg.target)
}

function insertConcordanceTarget(segId: string, target: string) {
  if (!record.value || editorReadOnly.value) return
  const seg = record.value.segments.find(s => s.id === segId)
  if (!seg) return
  notice.value = ''
  segHistory.seed(seg)
  const by = editActor()
  patchSegment(segId, {
    target,
    targetStyles: [],
    status: 'draft',
    tmSavePending: false,
    origin: 'tm',
    updatedBy: by,
    updatedAt: new Date().toISOString(),
    ...withSegmentAudit(seg, {
      action: 'tm',
      by,
      detail: 'concordance',
      before: seg.target,
      after: target,
    }),
  })
  const after = record.value?.segments.find(s => s.id === segId)
  if (after) segHistory.commit(after)
  activateSegment(segId)
  scheduleSave()
}

const glossaryForPair = computed(() => {
  const meta = record.value?.meta
  if (!meta?.sourceLang || !meta?.targetLang) return []
  return glossaryTerms.value.filter(
    t => t.sourceLang === meta.sourceLang && t.targetLang === meta.targetLang
  )
})

async function reloadGlossary() {
  glossaryTerms.value = await listGlossaryTerms()
}

function insertGlossaryTarget(segId: string, targetTerm: string) {
  if (!record.value || editorReadOnly.value) return
  const seg = record.value.segments.find(s => s.id === segId)
  if (!seg) return
  notice.value = ''
  segHistory.seed(seg)
  const by = editActor()
  const next =
    seg.target && !seg.target.endsWith(' ') && seg.target.length
      ? `${seg.target} ${targetTerm}`
      : `${seg.target || ''}${targetTerm}`
  patchSegment(segId, {
    target: next,
    status: 'draft',
    tmSavePending: false,
    origin: 'manual',
    updatedBy: by,
    updatedAt: new Date().toISOString(),
    ...withSegmentAudit(seg, {
      action: 'manual',
      by,
      detail: 'glossary',
      before: seg.target,
      after: next,
    }),
  })
  const after = record.value?.segments.find(s => s.id === segId)
  if (after) segHistory.commit(after)
  activateSegment(segId)
  scheduleSave()
}

function applyTmMatch(segId: string, match: TmMatch) {
  if (!record.value || editorReadOnly.value) return
  const seg = record.value.segments.find(s => s.id === segId)
  if (!seg) return
  notice.value = ''
  segHistory.seed(seg)
  const by = match.unitId ? `tm:${match.unitId}` : 'tm'
  patchSegment(segId, {
    target: match.target,
    targetStyles: [],
    status: 'draft',
    tmSavePending: false,
    origin: 'tm',
    updatedBy: by,
    updatedAt: new Date().toISOString(),
    ...withSegmentAudit(seg, {
      action: 'tm',
      by,
      detail: `${Math.round(match.score * 100)}%`,
      before: seg.target,
      after: match.target,
    }),
  })
  const after = record.value?.segments.find(s => s.id === segId)
  if (after) segHistory.commit(after)
  scheduleSave()
}

function restoreSegmentSnapshot(
  segId: string,
  snap: { target: string; status: Segment['status']; targetStyles?: TargetStyleRange[] }
) {
  if (!record.value || editorReadOnly.value) return
  patchSegment(segId, {
    target: snap.target,
    targetStyles: snap.targetStyles ?? [],
    status: snap.status,
    tmSavePending: false,
    origin: 'manual',
    updatedBy: editActor(),
    updatedAt: new Date().toISOString(),
  })
  if (snap.target.trim()) markTmAutosave(segId)
  else clearTmAutosave(segId)
  scheduleSave(UNDO_SAVE_IDLE_MS)
}

const targetSelection = ref<{
  segId: string
  start: number
  end: number
  collapsed?: boolean
} | null>(null)
const projectFonts = computed(() => collectProjectFonts(record.value?.segments ?? []))

function onTargetSelection(
  segId: string,
  range: { start: number; end: number; collapsed?: boolean } | null
) {
  if (!range) {
    if (targetSelection.value?.segId === segId) targetSelection.value = null
    return
  }
  // Collapsed caret counts: styles apply to the whole segment in that mode.
  targetSelection.value = { segId, ...range }
}

const stylePaintNonce = ref(0)

/** Real range selection → that range; collapsed caret / no sel → entire plain target. */
function styleRangeForApply(
  sel: { start: number; end: number; collapsed?: boolean } | null | undefined,
  plainLen: number
): { start: number; end: number } {
  if (sel && !sel.collapsed && sel.start !== sel.end) {
    return { start: sel.start, end: sel.end }
  }
  return { start: 0, end: plainLen }
}

/**
 * Toolbar readout range (Word-like):
 * - non-empty selection → that range (mixed → —)
 * - collapsed caret → one character at the caret (style of the clicked word)
 * - no selection → whole segment (hover chrome)
 */
function styleRangeForUi(
  sel: { start: number; end: number; collapsed?: boolean } | null | undefined,
  plainLen: number
): { start: number; end: number } {
  if (plainLen <= 0) return { start: 0, end: 0 }
  if (sel && !sel.collapsed && sel.start !== sel.end) {
    return {
      start: Math.max(0, Math.min(plainLen, Math.min(sel.start, sel.end))),
      end: Math.max(0, Math.min(plainLen, Math.max(sel.start, sel.end))),
    }
  }
  if (sel) {
    const caret = Math.max(0, Math.min(plainLen, sel.start))
    if (caret >= plainLen) return { start: plainLen - 1, end: plainLen }
    return { start: caret, end: caret + 1 }
  }
  return { start: 0, end: plainLen }
}

type StyleUiState = {
  segId: string
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  vertAlign: 'superscript' | 'subscript' | null
  font: string | null
  fontMixed: boolean
  fontSizePt: number | null
  fontSizeMixed: boolean
  color: string | null
  colorMixed: boolean
  highlight: string | null
  highlightMixed: boolean
}

function emptyStyleUi(segId: string): StyleUiState {
  return {
    segId,
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    vertAlign: null,
    font: null,
    fontMixed: false,
    fontSizePt: null,
    fontSizeMixed: false,
    color: null,
    colorMixed: false,
    highlight: null,
    highlightMixed: false,
  }
}

function stylesForSegmentUi(seg: Segment): TargetStyleRange[] {
  return effectiveTargetStyles(seg.target, seg.source, seg.spans, seg.targetStyles)
}

function styleUiFromUniform(
  segId: string,
  styles: TargetStyleRange[] | undefined,
  plainLen: number,
  start: number,
  end: number
): StyleUiState {
  const args = [styles, plainLen, start, end] as const
  const font = selectionUniformValue(...args, 'font')
  const fontSizePt = selectionUniformValue(...args, 'fontSizePt')
  const color = selectionUniformValue(...args, 'color')
  const highlight = selectionUniformValue(...args, 'highlight')
  const vertAlign = selectionUniformValue(...args, 'vertAlign')
  return {
    segId,
    bold: selectionHasProp(...args, 'bold'),
    italic: selectionHasProp(...args, 'italic'),
    underline: selectionHasProp(...args, 'underline'),
    strike: selectionHasProp(...args, 'strike'),
    vertAlign: vertAlign ?? null,
    font: font ?? null,
    fontMixed: font === undefined,
    fontSizePt: fontSizePt ?? null,
    fontSizeMixed: fontSizePt === undefined,
    color: color ?? null,
    colorMixed: color === undefined,
    highlight: highlight ?? null,
    highlightMixed: highlight === undefined,
  }
}

/** Toolbar: caret → style at click; selection → that range; else whole segment. */
function styleUiForSegment(seg: Segment): StyleUiState {
  const styles = stylesForSegmentUi(seg)
  // Empty target: show predominant source style (Word default typing style).
  if (!seg.target.length) {
    const pred = predominantSourceStyle(seg.source, seg.spans)
    if (!Object.keys(pred).length) return emptyStyleUi(seg.id)
    const one: TargetStyleRange[] = [{ start: 0, end: 1, ...pred }]
    return styleUiFromUniform(seg.id, one, 1, 0, 1)
  }
  const sel = targetSelection.value?.segId === seg.id ? targetSelection.value : null
  const { start, end } = styleRangeForUi(sel, seg.target.length)
  if (start >= end) return emptyStyleUi(seg.id)
  return styleUiFromUniform(seg.id, styles, seg.target.length, start, end)
}

/** Enable style controls without requiring caret focus — active or hovered row is enough. */
function styleToolbarLive(segId: string) {
  return (
    activeSegmentId.value === segId ||
    hoverSegmentId.value === segId ||
    targetSelection.value?.segId === segId
  )
}

function applyStyleToSegment(segId: string, patch: StyleApplyPatch) {
  if (!record.value || editorReadOnly.value) return
  const seg = record.value.segments.find(s => s.id === segId)
  if (!seg) return
  const sel = targetSelection.value?.segId === segId ? targetSelection.value : null
  const { start, end } = styleRangeForApply(sel, seg.target.length)
  if (start >= end) return
  if (activeSegmentId.value !== segId) activateSegment(segId)
  const base = stylesForSegmentUi(seg)
  const next = applyStyleRange(base, seg.target.length, start, end, patch)
  updateTarget(seg, seg.target, next)
  stylePaintNonce.value++
}

function onEditorKeydown(e: KeyboardEvent) {
  if (editorReadOnly.value) return
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return
  const k = e.key.toLowerCase()
  if (k !== 'b' && k !== 'i' && k !== 'u') return
  const segId = targetSelection.value?.segId ?? activeSegmentId.value
  if (!segId) return
  e.preventDefault()
  applyStyleToSegment(segId, {
    op: 'toggle',
    prop: k === 'b' ? 'bold' : k === 'i' ? 'italic' : 'underline',
  })
}

function undoSegment(segId: string) {
  if (!record.value || editorReadOnly.value) return
  const snap = segHistory.undo(segId)
  if (snap) restoreSegmentSnapshot(segId, snap)
}

function redoSegment(segId: string) {
  if (!record.value || editorReadOnly.value) return
  const snap = segHistory.redo(segId)
  if (snap) restoreSegmentSnapshot(segId, snap)
}

async function saveSegmentToTmById(segId: string) {
  if (!record.value || editorReadOnly.value || !personalTmWritable.value) return
  const seg = record.value.segments.find(s => s.id === segId)
  if (!seg || !seg.target.trim()) return

  const status = finalizeSegmentStatus({ ...seg, status: seg.target.trim() ? 'done' : seg.status })
  patchSegment(segId, { status })
  const segments = record.value.segments.map(s => (s.id === segId ? { ...s, status } : s))
  try {
    const tmOptions = {
      sourceLang: record.value.meta.sourceLang,
      targetLang: record.value.meta.targetLang,
      projectId: record.value.meta.id,
      actor: publicActorLabel(user.value),
      onlyIds: [segId],
    }
    const dirty = await recordDoneSegmentsInTm(segments, {
      ...tmOptions,
    })
    markTmDirty(...dirty)
    clearTmAutosave(segId)
    tmUnits.value = personalTmReadable.value ? await listTmUnits() : []
  } catch (e) {
    setSaveError(e)
  }
}

async function exportTmxFile() {
  if (!record.value || !personalTmReadable.value) return
  if (!tmUnits.value.length) {
    notice.value = t('editor.tmxExportEmpty')
    return
  }
  const xml = exportTmx(tmUnits.value, {
    sourceLang: record.value.meta.sourceLang,
    targetLang: record.value.meta.targetLang,
  })
  downloadBlob(new Blob([xml], { type: 'application/xml' }), 'translation-memory.tmx')
}

function openTmxImport() {
  if (!personalTmWritable.value) return
  tmImportInput.value?.click()
}

async function onTmxImportChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !personalTmWritable.value) return
  try {
    const xml = await file.text()
    const units = parseTmx(xml)
    const { count, ids } = await importTmUnits(units)
    markTmDirty(...ids)
    tmUnits.value = personalTmReadable.value ? await listTmUnits() : []
    notice.value = t('editor.tmxImported', { count })
    error.value = ''
  } catch (err) {
    setSaveError(err)
  }
}

async function withSaving<T>(fn: () => Promise<T>): Promise<T | undefined> {
  saving.value = true
  try {
    await persistNow()
    return await fn()
  } catch (e) {
    setSaveError(e)
    return undefined
  } finally {
    saving.value = false
  }
}

function activateSegment(segId: string) {
  const seg = record.value?.segments.find(s => s.id === segId)
  if (seg) segHistory.seed(seg)
  hoverSegmentId.value = segId
  if (activeSegmentId.value === segId) return
  activeSegmentId.value = segId
  scheduleScrollPersist()
}

function scrollToSegment(segId: string) {
  const el = document.getElementById(`segment-${segId}`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function onPreviewSelectSegment(segId: string) {
  activeSegmentId.value = segId
  scheduleScrollPersist()
  void nextTick(() => scrollToSegment(segId))
}

function deactivateEditor() {
  const el = document.activeElement
  if (el instanceof HTMLElement) {
    if (el.closest('.editor-layout') || el.closest('.rich-target-inner') || el.isContentEditable) {
      el.blur()
    }
  }
  targetSelection.value = null
  hoverSegmentId.value = null
  railHovered.value = false
  if (activeSegmentId.value === null) return
  activeSegmentId.value = null
  scheduleScrollPersist()
}

function onClearFocusKey(e: KeyboardEvent) {
  // Project dialogs still dismiss on Escape regardless of the clear-focus binding.
  if (e.key === 'Escape') {
    if (settingsOpen.value) {
      e.preventDefault()
      settingsOpen.value = false
      return
    }
    if (resegmentOpen.value) {
      e.preventDefault()
      resegmentOpen.value = false
      return
    }
    if (shareOpen.value) {
      e.preventDefault()
      shareOpen.value = false
      return
    }
    if (thresholdOpen.value) {
      e.preventDefault()
      thresholdOpen.value = false
      return
    }
  }
  if (!matchesBinding(e, shortcutBindings.value.clearFocus)) return
  e.preventDefault()
  deactivateEditor()
}

const hoverSegmentId = ref<string | null>(null)
/** Idle magnet + dimmed header icons park on the first segment (no viewport tracking). */
const idleAnchorId = computed(() => record.value?.segments[0]?.id ?? null)
/** Pointer over the magnetic rail cluster — light header icons on magnet target. */
const railHovered = ref(false)
/**
 * Dimmed header icons on the first segment while nothing is engaged
 * (no active segment, no row hover, no rail hover).
 */
const idleViewportChrome = computed(
  () => !activeSegmentId.value && !hoverSegmentId.value && !railHovered.value
)
const segmentListEl = ref<HTMLElement | null>(null)
const chromeStacked = ref(false)
let chromeMq: MediaQueryList | null = null
let previewOverlayMq: MediaQueryList | null = null

function onChromeMq() {
  chromeStacked.value = chromeMq?.matches ?? false
}

function onRowHover(segId: string | null) {
  // While a segment is active, hover cannot retarget the rail — stay glued to active.
  if (activeSegmentId.value) {
    hoverSegmentId.value = activeSegmentId.value
    return
  }
  hoverSegmentId.value = segId
}

watch(activeSegmentId, id => {
  hoverSegmentId.value = id
})

function magnetTargetId() {
  return pickMagnetRowId({
    activeId: activeSegmentId.value,
    hoverId: hoverSegmentId.value,
    viewportAnchorId: idleAnchorId.value,
  })
}

/** Segment whose header centers should light up while the rail is hovered. */
const railChromeSegId = computed(() => (railHovered.value ? magnetTargetId() : null))

function onRailHover(hovered: boolean) {
  railHovered.value = hovered
}

const railLeaveEmptyActive = computed(() => {
  const id = magnetTargetId()
  if (!id || !record.value) return false
  const seg = record.value.segments.find(s => s.id === id)
  return Boolean(seg && isIntentionallyEmpty(seg))
})

function onRailCopy(segId: string) {
  activateSegment(segId)
  copySourceById(segId)
}

function onRailLeaveEmpty(segId: string) {
  activateSegment(segId)
  leaveEmptyById(segId)
}

function onRailReset(segId: string) {
  activateSegment(segId)
  resetTargetById(segId)
}

function onEditorPointerDown(e: PointerEvent) {
  const target = e.target
  if (!(target instanceof Element)) return
  // Keep the row active when using rail, headers, style toolbar, or TM controls.
  if (
    target.closest(
      '.target-pane, .magnetic-rail, .magnetic-cluster, .source-header, .target-header, .tm-picker, .style-toolbar, .rail-gutter, .stacked-actions'
    )
  ) {
    return
  }
  deactivateEditor()
}

function schedulePreviewRefresh() {
  if (!previewEnabled.value) return
  if (previewTimer) clearTimeout(previewTimer)
  previewTimer = setTimeout(() => {
    previewToken.value++
  }, 800)
}

function togglePreview() {
  previewEnabled.value = !previewEnabled.value
  writePreviewEnabled(previewEnabled.value)
  if (previewEnabled.value) previewToken.value++
}

function closePreview() {
  if (!previewEnabled.value) return
  previewEnabled.value = false
  writePreviewEnabled(false)
}

function onPreviewOverlayMq() {
  previewOverlayMode.value = previewOverlayMq?.matches ?? false
}

function onPreviewOverlayKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && previewAsOverlay.value) {
    e.preventDefault()
    closePreview()
  }
}

watch(allSaved, saved => {
  if (saved) schedulePreviewRefresh()
})

watch(previewEnabled, on => {
  if (on) previewToken.value++
})

watch(previewAsOverlay, on => {
  if (on) document.body.style.overflow = 'hidden'
  else document.body.style.removeProperty('overflow')
})

async function uploadCloudBackup() {
  if (!record.value || editorReadOnly.value) return
  saving.value = true
  try {
    await persistNow()
    await pushProjectBackup(record.value)
    notice.value = t('editor.cloudBackupOk')
    error.value = ''
  } catch (e) {
    notice.value = ''
    error.value = t('editor.cloudBackupFail')
    setSaveError(e)
  } finally {
    saving.value = false
  }
}

async function downloadProject() {
  if (!record.value) return
  await withSaving(async () => {
    const blob = await packProjectFile(record.value!)
    downloadBlob(blob, `${record.value!.meta.name}.tcat.zip`)
    notice.value = t('editor.projectSaved')
  })
}

function openShareDialog() {
  shareOpen.value = true
}

function closeShareDialog() {
  shareOpen.value = false
}

async function downloadFromShareDialog() {
  closeShareDialog()
  await downloadProject()
}

async function applyEmptyProjectContent(next: ProjectRecord) {
  record.value = next
  allSaved.value = true
  activeSegmentId.value = null
  hoverSegmentId.value = null
  await saveProject(next)
  await reportJobProgress()
  error.value = ''
}

async function confirmJobFingerprint(docx: ArrayBuffer, filename: string) {
  const jobId = record.value?.meta.jobId
  if (!jobId) return true
  try {
    const job = await getJob(jobId)
    const fp = await fingerprintDocx(filename, docx)
    if (!fingerprintMismatch(job, fp)) return true
    return window.confirm(`${t('jobs.mismatchTitle')}\n\n${t('jobs.mismatchHint')}`)
  } catch {
    return true
  }
}

async function onEmptyDocxSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !record.value || editorReadOnly.value || emptyBusy.value) return
  emptyBusy.value = true
  error.value = ''
  try {
    const opened = await openDocx(file)
    if (!(await confirmJobFingerprint(opened.zipBytes, file.name))) return
    const fp = await fingerprintDocx(file.name, opened.zipBytes)
    const now = new Date().toISOString()
    await applyEmptyProjectContent({
      meta: {
        ...record.value.meta,
        name: file.name.replace(/\.docx$/i, '') || record.value.meta.name,
        updatedAt: now,
        segmentCount: opened.segments.length,
        doneCount: countTranslatedSegments(opened.segments),
        segmentSchemaVersion: SEGMENT_SCHEMA_DATE_SAFE,
        sourceFilename: fp.filename,
        sourceHash: fp.hash,
      },
      segments: opened.segments,
      docx: opened.zipBytes,
    })
    if (!opened.segments.length) {
      notice.value = t('projects.emptyDoc')
    } else {
      notice.value = ''
    }
  } catch (err) {
    error.value =
      err instanceof DocxError || err instanceof Error ? err.message : String(err)
  } finally {
    emptyBusy.value = false
  }
}

async function onEmptyProjectSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !record.value || editorReadOnly.value || emptyBusy.value) return
  emptyBusy.value = true
  error.value = ''
  try {
    const imported = await unpackProjectFile(file)
    if (!(await confirmJobFingerprint(imported.docx, imported.meta.sourceFilename || file.name))) {
      return
    }
    const now = new Date().toISOString()
    await applyEmptyProjectContent({
      meta: {
        ...imported.meta,
        id: record.value.meta.id,
        jobId: record.value.meta.jobId,
        createdAt: record.value.meta.createdAt,
        updatedAt: now,
        sourceLang: imported.meta.sourceLang || record.value.meta.sourceLang,
        targetLang: imported.meta.targetLang || record.value.meta.targetLang,
      },
      segments: imported.segments,
      docx: imported.docx,
    })
    if (!imported.segments.length) {
      notice.value = t('projects.emptyDoc')
    } else {
      notice.value = ''
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    emptyBusy.value = false
  }
}

function openSharedWork() {
  if (!record.value) return
  if (record.value.meta.jobId) {
    sharedPanelOpen.value = true
  } else if (!projectLease.blocked.value) {
    sharedCreateOpen.value = true
  }
}

async function onSharedWorkCreated(job: Job) {
  if (!record.value) return
  try {
    record.value = bindProjectToJob(record.value, job)
    await saveProject(record.value)
    await reloadJobMembership(job.id)
    await reportJobProgress()
    sharedCreateOpen.value = false
    sharedPanelOpen.value = true
    error.value = ''
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

async function exportDocx() {
  if (!record.value) return
  if (!allSaved.value) {
    const ok = window.confirm(t('editor.exportUnsavedConfirm'))
    if (!ok) return
  }
  await withSaving(async () => {
    const blob = await buildTranslatedDocx(record.value!.docx, record.value!.segments)
    downloadBlob(blob, `${record.value!.meta.name}.translated.docx`)
    notice.value = t('editor.exported')
  })
}

async function goBack() {
  if (record.value && !allSaved.value) {
    saving.value = true
    try {
      await persistNow()
    } catch (e) {
      setSaveError(e)
      return
    } finally {
      saving.value = false
    }
  }
  await persistScroll()
  await router.push({ name: 'projects' })
}
</script>

<template>
  <section v-if="record" class="editor-page" @pointerdown.capture="onEditorPointerDown">
    <Teleport to="#app-header-center">
      <div class="toolbar-bar">
        <div class="toolbar-zone toolbar-zone--nav">
          <IconButton :title="t('editor.backHint')" @click="goBack">
            <EditorGlyph name="back" />
          </IconButton>
        </div>
        <span class="toolbar-sep" aria-hidden="true" />
        <div class="toolbar-zone toolbar-zone--doc">
          <h1 class="doc-title">
            <MarqueeText :text="displayName" max-width="100%" />
          </h1>
          <TooltipWrap class="doc-format" :text="t('editor.docFormatHint')">
            {{ t('editor.docFormat') }}
          </TooltipWrap>
        </div>
        <span class="toolbar-sep" aria-hidden="true" />
        <div class="toolbar-zone toolbar-zone--meta">
          <span class="progress-group">
            <TooltipWrap as="span" class="progress" :text="progressTitle">
              {{ t('editor.progressShort', { done, total }) }}
            </TooltipWrap>
            <TooltipWrap
              as="span"
              class="coverage"
              :text="t('editor.tmCoverageHint', { tm: tmCoveragePct, done: donePct })"
            >
              TM {{ tmCoveragePct }}% · {{ donePct }}%
            </TooltipWrap>
            <TooltipWrap as="span" class="lang-pair-wrap" :text="t('editor.langPairHint')">
              <button type="button" class="lang-pair" @click="openProjectSettings">
                {{ langPairTitle }}
              </button>
            </TooltipWrap>
            <span class="threshold-wrap">
              <IconButton
                :title="t('editor.thresholdHint')"
                :active="thresholdOpen"
                @click="toggleThresholdSlider"
              >
                <EditorGlyph name="percent" />
              </IconButton>
              <div
                v-if="thresholdOpen"
                class="threshold-slider"
                role="group"
                :aria-label="t('editor.thresholdLabel')"
              >
                <input
                  class="threshold-range"
                  type="range"
                  min="50"
                  max="100"
                  step="1"
                  :value="thresholdPct"
                  :disabled="editorReadOnly"
                  @input="onThresholdInput"
                  @change="onThresholdChange"
                />
                <span class="threshold-pct">{{ thresholdPct }}%</span>
              </div>
            </span>
            <TooltipWrap
              as="span"
              class="save-indicator"
              :class="savePhase"
              :text="saveStatusTitle"
              aria-live="polite"
              :aria-label="saveStatusTitle"
            >
              <Transition name="save-state" mode="out-in">
                <span v-if="savePhase === 'saving'" key="saving" class="save-spinner-wrap">
                  <span class="save-spinner" aria-hidden="true" />
                  <span class="save-orbit" aria-hidden="true" />
                </span>
                <svg
                  v-else-if="savePhase === 'saved'"
                  key="saved"
                  class="save-check"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.25"
                  aria-hidden="true"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="m4.5 8.25 2.75 2.75L11.5 5.5"
                  />
                </svg>
                <span v-else key="pending" class="save-pending-wrap" aria-hidden="true">
                  <span class="save-pending-dot" />
                  <span class="save-pending-ring" />
                </span>
              </Transition>
            </TooltipWrap>
          </span>
        </div>
        <span class="toolbar-sep" aria-hidden="true" />
        <div class="toolbar-zone toolbar-zone--actions">
          <IconButton
            :title="previewEnabled ? t('editor.previewOffHint') : t('editor.previewOnHint')"
            :active="previewEnabled"
            @click="togglePreview"
          >
            <EditorGlyph :name="previewEnabled ? 'preview-off' : 'preview'" />
          </IconButton>
          <IconButton :title="t('editor.shareProjectHint')" @click="openShareDialog">
            <EditorGlyph name="archive" />
          </IconButton>
          <IconButton
            :title="record.meta.jobId ? t('jobs.openPanelHint') : t('jobs.createFromEditorHint')"
            :active="Boolean(record.meta.jobId)"
            :badge="sharedJoinUnread"
            :disabled="!record.meta.jobId && editorReadOnly"
            @click="openSharedWork"
          >
            <EditorGlyph name="send" />
          </IconButton>
          <IconButton
            :title="t('editor.cloudBackupHint')"
            :disabled="!record || editorReadOnly"
            @click="uploadCloudBackup"
          >
            <EditorGlyph name="cloud-upload" />
          </IconButton>
          <IconButton
            :title="t('editor.importTmxHint')"
            :disabled="!personalTmWritable"
            @click="openTmxImport"
          >
            <EditorGlyph name="import" />
          </IconButton>
          <IconButton
            :title="t('editor.exportTmxHint')"
            :disabled="!personalTmReadable"
            @click="exportTmxFile"
          >
            <EditorGlyph name="export" />
          </IconButton>
          <IconButton
            :title="t('glossary.openHint')"
            :active="glossaryOpen"
            @click="glossaryOpen = true"
          >
            <EditorGlyph name="glossary" />
          </IconButton>
          <IconButton
            :title="
              tmSettings.autoSaveToTm ? t('editor.tmAutoSaveOnHint') : t('editor.tmAutoSaveOffHint')
            "
            :active="tmSettings.autoSaveToTm"
            @click="toggleAutoSaveToTm()"
          >
            <EditorGlyph name="tm-commit" />
          </IconButton>
          <!-- Final deliverable: translated DOCX — always rightmost in this zone. -->
          <IconButton :title="t('editor.exportDocxHint')" @click="exportDocx">
            <EditorGlyph name="download-docx" />
          </IconButton>
          <input
            ref="tmImportInput"
            type="file"
            accept=".tmx,application/xml,text/xml"
            hidden
            @change="onTmxImportChange"
          />
        </div>
      </div>
    </Teleport>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-else-if="notice" class="notice">{{ notice }}</p>

    <p v-if="projectLease.blocked.value" class="lease-notice" role="status">
      {{ !projectLease.tabLeader.value ? t('editor.leaseBlocked') : t('editor.cloudLockBlocked') }}
    </p>
    <p v-else-if="jobRole === 'viewer'" class="lease-notice" role="status">
      {{ t('jobs.viewerReadOnly') }}
    </p>

    <div v-if="total === 0" class="empty-start">
      <h2>{{ t('editor.emptyStartTitle') }}</h2>
      <p class="empty-start-hint">{{ t('editor.emptyStartHint') }}</p>
      <div v-if="!editorReadOnly" class="empty-start-actions">
        <button
          type="button"
          class="empty-start-primary"
          :disabled="emptyBusy"
          @click="emptyDocxInput?.click()"
        >
          {{ t('editor.emptyStartFromDocx') }}
        </button>
        <button type="button" :disabled="emptyBusy" @click="emptyProjectInput?.click()">
          {{ t('editor.emptyStartImport') }}
        </button>
      </div>
      <input
        ref="emptyDocxInput"
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        hidden
        @change="onEmptyDocxSelected"
      />
      <input
        ref="emptyProjectInput"
        type="file"
        accept=".zip,.tcat.zip,application/zip"
        hidden
        @change="onEmptyProjectSelected"
      />
    </div>

    <div
      v-else
      class="editor-layout"
      :class="{
        'with-preview': previewEnabled && !previewAsOverlay,
        'preview-overlay-open': previewAsOverlay,
        'editor-readonly': editorReadOnly,
      }"
    >
      <div class="editor-main" @keydown="onEditorKeydown">
        <div id="editor-concordance-root" class="editor-concordance-root" />
        <div ref="segmentListEl" class="segment-list">
          <MagneticSegmentRail
            :list-el="segmentListEl"
            :active-segment-id="activeSegmentId"
            :hover-segment-id="hoverSegmentId"
            :viewport-anchor-id="idleAnchorId"
            :leave-empty-active="railLeaveEmptyActive"
            :stacked="chromeStacked"
            @copy="onRailCopy"
            @leave-empty="onRailLeaveEmpty"
            @reset="onRailReset"
            @rail-hover="onRailHover"
          />
          <ParagraphBlock
            v-for="(seg, i) in record.segments"
            :key="seg.id"
            :segments="[seg]"
            :display-index="i + 1"
            :active-segment-id="activeSegmentId"
            :viewport-anchor-id="idleAnchorId"
            :idle-viewport-chrome="idleViewportChrome"
            :force-chrome-reveal="railChromeSegId === seg.id"
            :matches-for="matchesFor"
            :needs-tm-save="needsTmSave"
            :tm-units="matchTmUnits"
            :glossary-terms="glossaryForPair"
            :source-lang="record.meta.sourceLang"
            :target-lang="record.meta.targetLang"
            :can-undo="segHistory.canUndo"
            :can-redo="segHistory.canRedo"
            :redo-count="segHistory.redoCount"
            :style-paint-nonce="stylePaintNonce"
            :style-disabled="editorReadOnly"
            :has-style-selection="styleToolbarLive(seg.id)"
            :bold-active="styleUiForSegment(seg).bold"
            :italic-active="styleUiForSegment(seg).italic"
            :underline-active="styleUiForSegment(seg).underline"
            :strike-active="styleUiForSegment(seg).strike"
            :vert-align="styleUiForSegment(seg).vertAlign"
            :font="styleUiForSegment(seg).font"
            :font-mixed="styleUiForSegment(seg).fontMixed"
            :font-size-pt="styleUiForSegment(seg).fontSizePt"
            :font-size-mixed="styleUiForSegment(seg).fontSizeMixed"
            :color="styleUiForSegment(seg).color"
            :color-mixed="styleUiForSegment(seg).colorMixed"
            :highlight="styleUiForSegment(seg).highlight"
            :highlight-mixed="styleUiForSegment(seg).highlightMixed"
            :fonts="projectFonts"
            :stacked="chromeStacked"
            @update-target="updateTargetById"
            @copy-source="copySourceById"
            @leave-empty="leaveEmptyById"
            @reset-target="resetTargetById"
            @apply-tm="(id, match) => applyTmMatch(id, match)"
            @save-to-tm="saveSegmentToTmById"
            @insert-concordance="insertConcordanceTarget"
            @insert-glossary="insertGlossaryTarget"
            @undo="undoSegment"
            @redo="redoSegment"
            @activate="activateSegment"
            @target-selection="onTargetSelection"
            @row-hover="onRowHover"
            @apply-style="patch => applyStyleToSegment(seg.id, patch)"
          />
        </div>
      </div>
      <Teleport to="body">
        <div
          v-if="previewAsOverlay"
          class="preview-overlay-root"
          @click.self="closePreview"
        >
          <DocxPreviewPanel
            :project-id="props.id"
            :record="record"
            :refresh-token="previewToken"
            :active-segment-id="activeSegmentId"
            overlay
            @select-segment="onPreviewSelectSegment"
            @close="closePreview"
          />
        </div>
      </Teleport>
      <DocxPreviewPanel
        v-if="previewEnabled && !previewAsOverlay"
        :project-id="props.id"
        :record="record"
        :refresh-token="previewToken"
        :active-segment-id="activeSegmentId"
        @select-segment="onPreviewSelectSegment"
      />
    </div>

    <GlossaryPanel
      :open="glossaryOpen"
      :source-lang="record.meta.sourceLang"
      :target-lang="record.meta.targetLang"
      @close="glossaryOpen = false"
      @changed="reloadGlossary"
    />
    <ProjectSettingsDialog
      :open="settingsOpen"
      :mode="settingsMode"
      :source-lang="record.meta.sourceLang"
      :target-lang="record.meta.targetLang"
      :fuzzy-min-score="record.meta.fuzzyMinScore"
      @close="closeProjectSettings"
      @save="saveProjectSettings"
    />
    <ResegmentDialog :open="resegmentOpen" @later="deferResegment" @confirm="confirmResegment" />
    <ShareProjectDialog
      :open="shareOpen"
      @close="closeShareDialog"
      @download="downloadFromShareDialog"
    />
    <CreateSharedWorkDialog
      :open="sharedCreateOpen"
      :project="record"
      @close="sharedCreateOpen = false"
      @created="onSharedWorkCreated"
    />
    <SharedWorkPanel
      v-if="record.meta.jobId"
      :open="sharedPanelOpen"
      :job-id="record.meta.jobId"
      @close="sharedPanelOpen = false"
    />
  </section>
  <p v-else-if="error" class="error">{{ error }}</p>
  <p v-else>…</p>
</template>

<style scoped lang="scss">
.editor-page {
  width: 100%;
  max-width: none;
}

.toolbar-bar {
  display: inline-flex;
  align-items: center;
  max-width: min(52rem, calc(100vw - 12rem));
  padding: 0.15rem 0;
}

.toolbar-zone {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding-inline: 0.35rem;
  min-width: 0;
}

.toolbar-zone--nav {
  padding-inline-start: 0.15rem;
}

.toolbar-zone--doc {
  gap: 0.45rem;
  flex: 1 1 auto;
  max-width: 13.5rem;
}

.toolbar-zone--meta {
  gap: 0.3rem;
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
}

.toolbar-zone--actions {
  gap: 0.05rem;
  padding-inline-end: 0.1rem;
}

.toolbar-sep {
  flex: 0 0 1px;
  align-self: stretch;
  margin-block: 0.4rem;
  background: var(--border);
}

h1.doc-title {
  margin: 0;
  min-width: 0;
  flex: 1 1 auto;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text);
}

.doc-format,
.progress {
  flex: 0 0 auto;
  font-size: 0.68rem;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
}

.progress-group {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  flex: 0 0 auto;
}

.coverage,
.lang-pair-wrap {
  flex: 0 0 auto;
  font-size: 0.68rem;
  font-weight: 500;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
  white-space: nowrap;
}

.lang-pair {
  border: 0;
  background: transparent;
  padding: 0;
  font: inherit;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0;
  text-transform: none;
  font-variant-numeric: tabular-nums;
  color: var(--text);
  white-space: nowrap;
  cursor: pointer;
}

.lang-pair:hover {
  color: var(--accent);
}

.threshold-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  z-index: 30;
}

.threshold-slider {
  position: absolute;
  top: calc(100% + 0.35rem);
  left: 50%;
  transform: translateX(-50%);
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 9rem;
  padding: 0.45rem 0.55rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
}

.threshold-range {
  width: 6rem;
  accent-color: var(--accent);
  cursor: pointer;
}

.threshold-pct {
  flex: 0 0 2.5rem;
  font-size: 0.72rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--text);
  text-align: right;
}

.save-indicator {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  flex: 0 0 1.25rem;
  color: var(--accent);
}

.save-indicator.saved {
  color: var(--ok);
}

.save-pending-wrap,
.save-spinner-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.15rem;
  height: 1.15rem;
}

.save-pending-dot {
  width: 0.52rem;
  height: 0.52rem;
  border-radius: 50%;
  background: currentColor;
  animation: save-dot-breathe 1.05s ease-in-out infinite;
}

.save-pending-ring,
.save-orbit {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1.5px solid currentColor;
  opacity: 0;
  animation: save-orbit 1.05s ease-out infinite;
}

.save-spinner {
  width: 1rem;
  height: 1rem;
  border: 2px solid transparent;
  border-top-color: currentColor;
  border-right-color: currentColor;
  border-radius: 50%;
  animation: spin 0.5s linear infinite;
}

.save-orbit {
  inset: -1px;
  animation-duration: 0.85s;
}

.save-check {
  width: 1.15rem;
  height: 1.15rem;
  display: block;
  animation: save-check-pop 0.34s cubic-bezier(0.34, 1.2, 0.64, 1);
}

.save-state-enter-active,
.save-state-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s cubic-bezier(0.34, 1.1, 0.64, 1);
}

.save-state-enter-from,
.save-state-leave-to {
  opacity: 0;
  transform: scale(0.55);
}

@keyframes save-dot-breathe {
  0%,
  100% {
    transform: scale(0.82);
    opacity: 0.8;
  }
  50% {
    transform: scale(1.18);
    opacity: 1;
  }
}

@keyframes save-orbit {
  0% {
    transform: scale(0.5);
    opacity: 0.65;
  }
  100% {
    transform: scale(1.45);
    opacity: 0;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes save-check-pop {
  from {
    transform: scale(0.4);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

.error {
  color: var(--danger);
  background: var(--danger-bg);
  padding: 0.65rem 0.85rem;
  border-radius: 8px;
}

.notice {
  color: var(--ok);
  font-size: 0.9rem;
}

.empty-start {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  min-height: min(52vh, 28rem);
  padding: 1.5rem 1rem;
  text-align: center;
}

.empty-start h2 {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text);
}

.empty-start-hint {
  margin: 0;
  max-width: 22rem;
  color: var(--text-muted);
  font-size: 0.88rem;
  line-height: 1.4;
}

.empty-start-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.45rem;
  margin-top: 0.35rem;
}

.empty-start-actions button {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.5rem 0.95rem;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.88rem;
  cursor: pointer;
}

.empty-start-actions button:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.empty-start-primary {
  border-color: var(--accent-strong) !important;
  background: var(--accent-strong) !important;
  color: var(--accent-text) !important;
}

.editor-layout {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  align-items: start;
  width: 100%;
  padding-top: 0.75rem;
}

.editor-layout:not(.with-preview) {
  justify-items: center;
}

.editor-layout:not(.with-preview) .editor-main {
  width: min(100%, 72rem);
}

.editor-layout.with-preview {
  /* Preview is intrinsic-width; allow the editor column to claim remaining space and shrink. */
  grid-template-columns: minmax(0, 1fr) minmax(0, auto);
  min-width: 0;
}

.editor-main {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  min-width: 0;
  width: 100%;
}

.segment-list {
  position: relative;
  width: 100%;
  min-width: 0;
}

.editor-concordance-root {
  position: absolute;
  inset: 0;
  z-index: 12;
  pointer-events: none;
}

.lease-notice {
  margin: 0 0 0.75rem;
  padding: 0.65rem 0.85rem;
  border-radius: 8px;
  background: rgba(212, 168, 90, 0.14);
  border: 1px solid rgba(212, 168, 90, 0.35);
  color: var(--text);
  font-size: 0.9rem;
}

.editor-layout.editor-readonly {
  pointer-events: none;
  opacity: 0.62;
  user-select: none;
}

@media (max-width: 1280px) {
  .editor-layout.with-preview {
    grid-template-columns: 1fr;
  }
}

.preview-overlay-root {
  position: fixed;
  top: 3.35rem;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 40;
  display: flex;
  align-items: stretch;
  justify-content: center;
  padding: 0.55rem 0.65rem 0.65rem;
  background: color-mix(in srgb, var(--bg) 72%, transparent);
  backdrop-filter: blur(2px);
  pointer-events: auto;
}

.preview-overlay-root :deep(.preview-panel) {
  flex: 1 1 auto;
  min-height: 0;
  width: fit-content;
  max-width: 100%;
  margin: 0 auto;
  padding: 0.45rem 0.55rem 0.55rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.28);
}
</style>
