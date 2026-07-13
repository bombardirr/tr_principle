<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import MarqueeText from '@/components/MarqueeText.vue'
import SegmentRow from '@/components/SegmentRow.vue'
import DocxPreviewPanel from '@/components/DocxPreviewPanel.vue'
import { buildTranslatedDocx, downloadBlob } from '@/docx/exportDocx'
import { getProject, saveProject } from '@/storage/idb'
import { readEditorScroll, restoreWindowScroll, writeEditorScroll } from '@/storage/editorScroll'
import { packProjectFile } from '@/storage/projectFile'
import IconButton from '@/components/IconButton.vue'
import EditorGlyph from '@/components/EditorGlyph.vue'
import TooltipWrap from '@/components/TooltipWrap.vue'
import {
  countDoneSegments,
  finalizeSegmentStatus,
  normalizeSegmentStatus,
} from '@/utils/segmentStatus'
import type { ProjectRecord, Segment } from '@/types/project'

const props = defineProps<{ id: string }>()
const { t } = useI18n()
const router = useRouter()

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

const done = computed(() =>
  record.value ? countDoneSegments(record.value.segments) : 0,
)
const total = computed(() => record.value?.segments.length ?? 0)

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
  if (!record.value) return
  clearSaveTimer()
  await saveProject(record.value)
  for (const s of record.value.segments) {
    s.status = finalizeSegmentStatus(s)
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
  void load()
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
  if (record.value && !allSaved.value) {
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
  if (!record.value) return
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
  if (!record.value) return
  notice.value = ''
  patchSegment(seg.id, {
    target: value,
    status: value.trim() ? 'draft' : seg.status === 'done' ? 'draft' : 'empty',
  })
  scheduleSave()
}

function copySource(seg: Segment) {
  if (!record.value) return
  notice.value = ''
  patchSegment(seg.id, { target: seg.source, status: 'draft' })
  scheduleSave()
}

function leaveEmpty(seg: Segment) {
  if (!record.value) return
  notice.value = ''
  patchSegment(seg.id, { target: '', status: 'done' })
  scheduleSave()
}

function resetTarget(seg: Segment) {
  if (!record.value) return
  notice.value = ''
  patchSegment(seg.id, { target: '', status: 'empty' })
  scheduleSave()
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
  if (target instanceof Element && target.closest('.target-pane')) return
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
  await router.push('/')
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
            <EditorGlyph name="save" />
          </IconButton>
          <IconButton :title="t('editor.exportDocxHint')" @click="exportDocx">
            <EditorGlyph name="export" />
          </IconButton>
        </div>
      </div>
    </Teleport>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-else-if="notice" class="notice">{{ notice }}</p>
    <p v-if="total === 0" class="notice">{{ t('projects.emptyDoc') }}</p>

    <div class="editor-layout" :class="{ 'with-preview': previewEnabled }">
      <div class="editor-main">
        <SegmentRow
          v-for="seg in record.segments"
          :key="seg.id"
          :segment="seg"
          :active="activeSegmentId === seg.id"
          @update-target="updateTarget(seg, $event)"
          @copy-source="copySource(seg)"
          @leave-empty="leaveEmpty(seg)"
          @reset-target="resetTarget(seg)"
          @activate="activateSegment(seg.id)"
        />
      </div>
      <DocxPreviewPanel
        v-if="previewEnabled"
        :project-id="props.id"
        :record="record"
        :refresh-token="previewToken"
        :active-segment-id="activeSegmentId"
      />
    </div>
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

@media (max-width: 1100px) {
  .editor-layout.with-preview {
    grid-template-columns: 1fr;
  }

  .editor-layout.with-preview :deep(.preview-panel) {
    justify-self: center;
  }
}
</style>
