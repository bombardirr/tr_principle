<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import SegmentRow from '@/components/SegmentRow.vue'
import DocxPreviewPanel from '@/components/DocxPreviewPanel.vue'
import { buildTranslatedDocx, downloadBlob } from '@/docx/exportDocx'
import { getProject, saveProject } from '@/storage/idb'
import { readEditorScroll, restoreWindowScroll, writeEditorScroll } from '@/storage/editorScroll'
import { packProjectFile } from '@/storage/projectFile'
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

const done = computed(
  () => record.value?.segments.filter((s) => s.target.trim() !== '').length ?? 0,
)
const total = computed(() => record.value?.segments.length ?? 0)

function normalizeStatuses(segments: Segment[]): Segment[] {
  return segments.map((s) => ({
    ...s,
    status: s.target.trim() ? 'done' : 'empty',
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
    s.status = s.target.trim() ? 'done' : 'empty'
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
  patchSegment(seg.id, { target: value, status: 'draft' })
  scheduleSave()
}

function copySource(seg: Segment) {
  if (!record.value) return
  notice.value = ''
  patchSegment(seg.id, { target: seg.source, status: 'draft' })
  scheduleSave()
}

function clearTarget(seg: Segment) {
  if (!record.value) return
  notice.value = ''
  patchSegment(seg.id, { target: '', status: 'draft' })
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
  activeSegmentId.value = segId
  scheduleScrollPersist()
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
  <section v-if="record" class="editor-page">
    <div class="toolbar">
      <button type="button" class="ghost" @click="goBack">{{ t('editor.back') }}</button>
      <h1>{{ record.meta.name }}</h1>
      <span class="progress">{{ t('editor.progress', { done, total }) }}</span>
      <span v-if="saving" class="save-status saving" aria-live="polite">
        <span class="spinner" aria-hidden="true" />
        {{ t('editor.saving') }}
      </span>
      <span v-else-if="allSaved" class="save-status saved" aria-live="polite">
        {{ t('editor.autosaved') }}
      </span>
      <div class="spacer" />
      <button
        type="button"
        class="toggle"
        :class="{ active: previewEnabled }"
        :title="t('editor.previewHint')"
        @click="togglePreview"
      >
        {{ previewEnabled ? t('editor.previewOff') : t('editor.previewOn') }}
      </button>
      <button
        v-if="previewEnabled"
        type="button"
        class="ghost"
        :disabled="!record"
        @click="refreshPreviewNow"
      >
        {{ t('editor.previewRefresh') }}
      </button>
      <button type="button" @click="downloadProject">{{ t('editor.saveProject') }}</button>
      <button type="button" class="primary" @click="exportDocx">
        {{ t('editor.exportDocx') }}
      </button>
    </div>

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
          @clear-target="clearTarget(seg)"
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

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.65rem;
  margin-bottom: 1rem;
  position: sticky;
  top: 0;
  z-index: 2;
  padding: 0.65rem 0;
  background: var(--bg);
}

h1 {
  margin: 0;
  font-size: 1.15rem;
  color: var(--text);
}

.progress {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.save-status {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
}

.save-status.saving {
  color: var(--text-muted);
}

.save-status.saved {
  color: var(--ok);
  font-weight: 600;
}

.spinner {
  width: 0.9rem;
  height: 0.9rem;
  border: 2px solid var(--spinner-track);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.spacer {
  flex: 1;
}

button {
  border: 1px solid var(--border-strong);
  background: var(--surface);
  color: var(--text);
  border-radius: 8px;
  padding: 0.4rem 0.75rem;
  cursor: pointer;
  font-size: 0.9rem;
}

button.primary {
  background: var(--accent-strong);
  border-color: var(--accent-strong);
  color: var(--accent-text);
}

button.ghost {
  background: transparent;
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
  grid-template-columns: 1fr 1fr;
}

.editor-main {
  min-width: 0;
  width: 100%;
}

button.toggle.active {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(91, 159, 212, 0.12);
}

@media (max-width: 1100px) {
  .editor-layout.with-preview {
    grid-template-columns: 1fr;
  }
}
</style>
