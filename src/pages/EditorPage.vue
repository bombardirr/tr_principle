<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import MarqueeText from '@/components/MarqueeText.vue'
import ParagraphBlock from '@/components/ParagraphBlock.vue'
import ProjectSettingsDialog from '@/components/ProjectSettingsDialog.vue'
import ResegmentDialog from '@/components/ResegmentDialog.vue'
import DocxPreviewPanel from '@/components/DocxPreviewPanel.vue'
import { buildTranslatedDocx, downloadBlob } from '@/docx/exportDocx'
import { getProject, saveProject } from '@/storage/idb'
import { readEditorScroll, restoreWindowScroll, writeEditorScroll } from '@/storage/editorScroll'
import { packProjectFile } from '@/storage/projectFile'
import IconButton from '@/components/IconButton.vue'
import EditorGlyph from '@/components/EditorGlyph.vue'
import TooltipWrap from '@/components/TooltipWrap.vue'
import { displayLabel, useAuth } from '@/auth/session'
import { useProjectAccess } from '@/composables/useProjectAccess'
import { scheduleProjectBackup, pushProjectBackup } from '@/projects/backup'
import { useTmSettings } from '@/composables/useTmSettings'
import { findTmMatches } from '@/tm/match'
import { findLangPairPreset, langPairLabel } from '@/tm/langPairs'
import { tmLookupKey } from '@/tm/normalize'
import { projectNeedsResegment, resegmentParagraphs } from '@/tm/resegment'
import { exportTmx, parseTmx } from '@/tm/tmx'
import {
  listTmUnits,
  recordDoneSegmentsInTm,
  importTmUnits,
  deleteTmForSegmentSource,
} from '@/storage/tmIdb'
import { markTmDirty } from '@/tm/sync'
import {
  countTranslatedSegments,
  finalizeSegmentStatus,
  isSegmentTranslated,
  normalizeSegmentStatus,
} from '@/utils/segmentStatus'
import type { ProjectRecord, Segment } from '@/types/project'
import { SEGMENT_SCHEMA_DATE_SAFE } from '@/types/project'
import type { TmMatch, TmUnit } from '@/types/tm'

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
const PREVIEW_STORAGE_KEY = 'appzac-preview-enabled'

const previewEnabled = ref(
  typeof localStorage !== 'undefined' && localStorage.getItem(PREVIEW_STORAGE_KEY) === '1',
)
const previewToken = ref(0)
let previewTimer: ReturnType<typeof setTimeout> | null = null
let pageScrollSaveTimer: ReturnType<typeof setTimeout> | null = null
const activeSegmentId = ref<string | null>(null)
const projectLease = useProjectAccess(() => props.id)
const { settings: tmSettings, togglePunctuationMode: toggleTmPunctuation, toggleAutoSaveToTm } =
  useTmSettings()
const tmUnits = shallowRef<TmUnit[]>([])
const tmImportInput = ref<HTMLInputElement | null>(null)
/** Segment ids changed while TM autosave is on — written on next persist only. */
const tmAutosaveIds = ref(new Set<string>())

function markTmAutosave(segId: string) {
  if (!tmSettings.value.autoSaveToTm) return
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

const done = computed(() =>
  record.value ? countTranslatedSegments(record.value.segments) : 0,
)
const total = computed(() => record.value?.segments.length ?? 0)

const tmCoveragePct = computed(() => {
  if (!record.value?.segments.length) return 0
  const opts = tmMatchOptions()
  let hit = 0
  for (const seg of record.value.segments) {
    if (
      findTmMatches(
        tmUnits.value,
        seg.source,
        record.value.meta.sourceLang,
        record.value.meta.targetLang,
        { ...opts, ...segmentNeighbors(seg) },
      ).length
    ) {
      hit++
    }
  }
  return Math.round((hit / record.value.segments.length) * 100)
})

const donePct = computed(() =>
  total.value ? Math.round((done.value / total.value) * 100) : 0,
)

const langPairTitle = computed(() => {
  const meta = record.value?.meta
  if (!meta?.sourceLang || !meta?.targetLang || !findLangPairPreset(meta.sourceLang, meta.targetLang)) {
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
const resegmentDeferred = ref(false)
const thresholdOpen = ref(false)

const needsResegment = computed(() =>
  projectNeedsResegment(record.value?.meta, record.value?.segments),
)

const thresholdPct = computed(() => {
  const score = record.value?.meta.fuzzyMinScore ?? tmSettings.value.fuzzyMinScore ?? 0.75
  return Math.round(score * 100)
})

function toggleThresholdSlider() {
  thresholdOpen.value = !thresholdOpen.value
}

function setThresholdPct(pct: number) {
  if (!record.value || projectLease.blocked.value) return
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
  if (!record.value || projectLease.blocked.value) return
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
  },
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
  { immediate: true },
)

function openProjectSettings() {
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
  if (!record.value || projectLease.blocked.value) return
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

function confirmResegment() {
  if (!record.value || projectLease.blocked.value) return
  const { segments, ambiguousCount } = resegmentParagraphs(record.value.segments)
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
  notice.value =
    ambiguousCount > 0
      ? t('editor.resegmentAmbiguous', { n: ambiguousCount })
      : t('editor.resegmentDone')
  scheduleSave()
}

const displayName = computed(() => {
  const name = record.value?.meta.name ?? ''
  return name.replace(/\.docx$/i, '') || name
})

const progressTitle = computed(() =>
  t('editor.progress', { done: done.value, total: total.value }),
)

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
  return segments.map((s) => ({
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

async function persistNow(): Promise<void> {
  if (!record.value || projectLease.blocked.value) return
  clearSaveTimer()

  const segments = record.value.segments.map((s) => ({
    ...s,
    status: finalizeSegmentStatus(s),
  }))
  record.value = {
    meta: record.value.meta,
    segments,
    docx: record.value.docx,
  }

  await saveProject(record.value)
  if (projectLease.isLeader.value) {
    scheduleProjectBackup(record.value)
  }
  if (tmSettings.value.autoSaveToTm && tmAutosaveIds.value.size) {
    const onlyIds = [...tmAutosaveIds.value]
    const dirty = await recordDoneSegmentsInTm(record.value.segments, {
      sourceLang: record.value.meta.sourceLang,
      targetLang: record.value.meta.targetLang,
      projectId: record.value.meta.id,
      actor: displayLabel(user.value) || 'local',
      onlyIds,
    })
    markTmDirty(...dirty)
    tmAutosaveIds.value = new Set()
    tmUnits.value = await listTmUnits()
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

async function restorePageScroll() {
  const snap = readEditorScroll(props.id)
  if (!snap) return
  if (snap.activeSegmentId) activeSegmentId.value = snap.activeSegmentId
  await nextTick()
  restoreWindowScroll(snap.pageY)
  window.setTimeout(() => restoreWindowScroll(snap.pageY), 150)
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
  record.value = withNormalizedRecord(found)
  await restorePageScroll()
}

function onBeforeUnload(e: BeforeUnloadEvent) {
  void persistScroll()
  if (!allSaved.value) e.preventDefault()
}

const PAGE_SCROLL_OPTS: AddEventListenerOptions = { passive: true }

onMounted(() => {
  projectLease.start()
  void load()
  void listTmUnits().then((units) => {
    tmUnits.value = units
  })
  window.addEventListener('scroll', onPageScroll, PAGE_SCROLL_OPTS)
  window.addEventListener('beforeunload', onBeforeUnload)
})

watch(() => props.id, () => {
  void load()
})

onUnmounted(() => {
  window.removeEventListener('scroll', onPageScroll, PAGE_SCROLL_OPTS)
  window.removeEventListener('beforeunload', onBeforeUnload)
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
  if (!record.value) return
  const segments = record.value.segments.map((s) =>
    s.id === segId ? { ...s, ...patch } : s,
  )
  record.value = {
    meta: record.value.meta,
    segments,
    docx: record.value.docx,
  }
}

function scheduleSave() {
  if (!record.value || projectLease.blocked.value) return
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
  }, SAVE_IDLE_MS)
}

function updateTarget(seg: Segment, value: string) {
  if (!record.value || projectLease.blocked.value) return
  notice.value = ''
  patchSegment(seg.id, {
    target: value,
    status: value.trim() ? 'draft' : seg.status === 'done' ? 'draft' : 'empty',
    tmSavePending: false,
    origin: 'manual',
    updatedBy: 'local',
    updatedAt: new Date().toISOString(),
  })
  markTmAutosave(seg.id)
  scheduleSave()
}

function updateTargetById(segId: string, value: string) {
  const seg = record.value?.segments.find((s) => s.id === segId)
  if (seg) updateTarget(seg, value)
}

function copySource(seg: Segment) {
  if (!record.value || projectLease.blocked.value) return
  notice.value = ''
  patchSegment(seg.id, {
    target: seg.source,
    status: 'draft',
    tmSavePending: false,
    origin: 'copy-source',
    updatedBy: 'local',
    updatedAt: new Date().toISOString(),
  })
  markTmAutosave(seg.id)
  scheduleSave()
}

function copySourceById(segId: string) {
  const seg = record.value?.segments.find((s) => s.id === segId)
  if (seg) copySource(seg)
}

function leaveEmpty(seg: Segment) {
  if (!record.value || projectLease.blocked.value) return
  notice.value = ''
  clearTmAutosave(seg.id)
  patchSegment(seg.id, {
    target: '',
    status: 'done',
    tmSavePending: false,
    origin: 'leave-empty',
    updatedBy: 'local',
    updatedAt: new Date().toISOString(),
  })
  scheduleSave()
}

function leaveEmptyById(segId: string) {
  const seg = record.value?.segments.find((s) => s.id === segId)
  if (seg) leaveEmpty(seg)
}

function resetTarget(seg: Segment) {
  if (!record.value || projectLease.blocked.value) return
  notice.value = ''
  clearTmAutosave(seg.id)
  patchSegment(seg.id, {
    target: '',
    status: 'empty',
    tmSavePending: false,
    origin: 'reset',
    updatedBy: 'local',
    updatedAt: new Date().toISOString(),
  })
  void removeSegmentFromTm(seg)
  scheduleSave()
}

function resetTargetById(segId: string) {
  const seg = record.value?.segments.find((s) => s.id === segId)
  if (seg) resetTarget(seg)
}

async function removeSegmentFromTm(seg: Segment) {
  if (!record.value) return
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
    fuzzyMinScore:
      record.value?.meta.fuzzyMinScore ?? tmSettings.value.fuzzyMinScore,
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
  const i = segs.findIndex((s) => s.id === seg.id)
  if (i < 0) return {}
  return {
    contextBefore: segs[i - 1]?.source,
    contextAfter: segs[i + 1]?.source,
  }
}

function matchesFor(seg: Segment): TmMatch[] {
  if (!record.value) return []
  return findTmMatches(
    tmUnits.value,
    seg.source,
    record.value.meta.sourceLang,
    record.value.meta.targetLang,
    { ...tmMatchOptions(), ...segmentNeighbors(seg) },
  )
}

/** Show “save to TM” only when target is non-empty and not already stored for this source. */
function needsTmSave(seg: Segment): boolean {
  if (!record.value || !seg.target.trim()) return false
  const key = tmLookupKey(
    seg.source,
    record.value.meta.sourceLang,
    record.value.meta.targetLang,
  )
  return !tmUnits.value.some((u) => u.sourceKey === key && u.target === seg.target)
}

const tmHintSegmentIds = computed(() => {
  if (!record.value) return []
  return record.value.segments
    .filter((seg) => matchesFor(seg).length > 0 && !isSegmentTranslated(seg))
    .map((seg) => seg.id)
})

function applyTmMatch(segId: string, match: TmMatch) {
  if (!record.value || projectLease.blocked.value) return
  notice.value = ''
  patchSegment(segId, {
    target: match.target,
    status: 'draft',
    tmSavePending: false,
    origin: 'tm',
    updatedBy: match.unitId ? `tm:${match.unitId}` : 'tm',
    updatedAt: new Date().toISOString(),
  })
  scheduleSave()
}

async function saveSegmentToTmById(segId: string) {
  if (!record.value || projectLease.blocked.value) return
  const seg = record.value.segments.find((s) => s.id === segId)
  if (!seg || !seg.target.trim()) return

  const status = finalizeSegmentStatus({ ...seg, status: seg.target.trim() ? 'done' : seg.status })
  patchSegment(segId, { status })
  const segments = record.value.segments.map((s) =>
    s.id === segId ? { ...s, status } : s,
  )
  try {
    const dirty = await recordDoneSegmentsInTm(segments, {
      sourceLang: record.value.meta.sourceLang,
      targetLang: record.value.meta.targetLang,
      projectId: record.value.meta.id,
      actor: displayLabel(user.value) || 'local',
      onlyIds: [segId],
    })
    markTmDirty(...dirty)
    clearTmAutosave(segId)
    tmUnits.value = await listTmUnits()
  } catch (e) {
    setSaveError(e)
  }
}

async function exportTmxFile() {
  if (!record.value) return
  if (!tmUnits.value.length) {
    notice.value = t('editor.tmxExportEmpty')
    return
  }
  const xml = exportTmx(tmUnits.value, {
    sourceLang: record.value.meta.sourceLang,
    targetLang: record.value.meta.targetLang,
  })
  downloadBlob(new Blob([xml], { type: 'application/xml' }), 'translation-memory.tmx')
  notice.value = t('editor.exportTmx')
}

function openTmxImport() {
  tmImportInput.value?.click()
}

async function onTmxImportChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const xml = await file.text()
    const units = parseTmx(xml)
    const { count, ids } = await importTmUnits(units)
    markTmDirty(...ids)
    tmUnits.value = await listTmUnits()
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
  if (el instanceof HTMLElement && el.closest('.target-pane')) {
    el.blur()
  }
  if (activeSegmentId.value === null) return
  activeSegmentId.value = null
  scheduleScrollPersist()
}

function onEditorPointerDown(e: PointerEvent) {
  const target = e.target
  if (!(target instanceof Element)) return
  // Keep the row active when using mid-toolbar or TM controls above the target.
  if (target.closest('.target-pane, .mid-toolbar, .meta-target, .tm-picker')) return
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
  localStorage.setItem(PREVIEW_STORAGE_KEY, previewEnabled.value ? '1' : '0')
  if (previewEnabled.value) previewToken.value++
}

function refreshPreviewNow() {
  if (!previewEnabled.value) return
  previewToken.value++
}

watch(allSaved, (saved) => {
  if (saved) schedulePreviewRefresh()
})

watch(previewEnabled, (on) => {
  if (on) previewToken.value++
})

async function uploadCloudBackup() {
  if (!record.value || projectLease.blocked.value) return
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

async function exportDocx() {
  if (!record.value) return
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
              <div v-if="thresholdOpen" class="threshold-slider" role="group" :aria-label="t('editor.thresholdLabel')">
                <input
                  class="threshold-range"
                  type="range"
                  min="50"
                  max="100"
                  step="1"
                  :value="thresholdPct"
                  :disabled="projectLease.blocked.value"
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
                  <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 8.25 2.75 2.75L11.5 5.5" />
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
          <IconButton
            :title="t('editor.previewRefreshHint')"
            :disabled="!record || !previewEnabled"
            @click="refreshPreviewNow"
          >
            <EditorGlyph name="refresh" />
          </IconButton>
          <IconButton :title="t('editor.saveProjectHint')" @click="downloadProject">
            <EditorGlyph name="archive" />
          </IconButton>
          <IconButton
            :title="t('editor.cloudBackupHint')"
            :disabled="!record || projectLease.blocked.value"
            @click="uploadCloudBackup"
          >
            <EditorGlyph name="cloud-upload" />
          </IconButton>
          <IconButton :title="t('editor.exportDocxHint')" @click="exportDocx">
            <EditorGlyph name="download-docx" />
          </IconButton>
          <IconButton :title="t('editor.exportTmxHint')" @click="exportTmxFile">
            <EditorGlyph name="download-tmx" />
          </IconButton>
          <IconButton :title="t('editor.importTmxHint')" @click="openTmxImport">
            <EditorGlyph name="upload-tmx" />
          </IconButton>
          <IconButton
            :title="
              tmSettings.autoSaveToTm
                ? t('editor.tmAutoSaveOnHint')
                : t('editor.tmAutoSaveOffHint')
            "
            :active="tmSettings.autoSaveToTm"
            @click="toggleAutoSaveToTm()"
          >
            <EditorGlyph name="tm-commit" />
          </IconButton>
          <IconButton
            :title="
              tmSettings.punctuationMode === 'soft'
                ? t('editor.tmPunctSoftHint')
                : t('editor.tmPunctStrictHint')
            "
            :active="tmSettings.punctuationMode === 'soft'"
            @click="toggleTmPunctuation()"
          >
            <EditorGlyph name="tm" />
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
    <p v-if="total === 0" class="notice">{{ t('projects.emptyDoc') }}</p>

    <p v-if="projectLease.blocked.value" class="lease-notice" role="status">
      {{
        !projectLease.tabLeader.value
          ? t('editor.leaseBlocked')
          : t('editor.cloudLockBlocked')
      }}
    </p>

    <div
      class="editor-layout"
      :class="{ 'with-preview': previewEnabled, 'editor-readonly': projectLease.blocked.value }"
    >
      <div class="editor-main">
        <ParagraphBlock
          v-for="(seg, i) in record.segments"
          :key="seg.id"
          :segments="[seg]"
          :display-index="i + 1"
          :active-segment-id="activeSegmentId"
          :matches-for="matchesFor"
          :needs-tm-save="needsTmSave"
          @update-target="updateTargetById"
          @copy-source="copySourceById"
          @leave-empty="leaveEmptyById"
          @reset-target="resetTargetById"
          @apply-tm="(id, match) => applyTmMatch(id, match)"
          @save-to-tm="saveSegmentToTmById"
          @activate="activateSegment"
        />
      </div>
      <DocxPreviewPanel
        v-if="previewEnabled"
        :project-id="props.id"
        :record="record"
        :refresh-token="previewToken"
        :active-segment-id="activeSegmentId"
        :tm-segment-ids="tmHintSegmentIds"
        @select-segment="onPreviewSelectSegment"
      />
    </div>

    <ProjectSettingsDialog
      :open="settingsOpen"
      :mode="settingsMode"
      :source-lang="record.meta.sourceLang"
      :target-lang="record.meta.targetLang"
      :fuzzy-min-score="record.meta.fuzzyMinScore"
      @close="closeProjectSettings"
      @save="saveProjectSettings"
    />
    <ResegmentDialog
      :open="resegmentOpen"
      @later="deferResegment"
      @confirm="confirmResegment"
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
  grid-template-columns: minmax(0, 1fr) auto;
}

.editor-main {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  min-width: 0;
  width: 100%;
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

@media (max-width: 1100px) {
  .editor-layout.with-preview {
    grid-template-columns: 1fr;
  }

  .editor-layout.with-preview :deep(.preview-panel) {
    justify-self: center;
  }
}
</style>
