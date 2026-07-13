<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { renderAsync } from 'docx-preview'
import { buildTranslatedDocx } from '@/docx/exportDocx'
import {
  highlightPreviewSegment,
  indexPreviewSegments,
} from '@/docx/previewHighlight'
import { readEditorScroll, writeEditorScroll } from '@/storage/editorScroll'
import type { ProjectRecord } from '@/types/project'

const props = defineProps<{
  projectId: string
  record: ProjectRecord
  refreshToken: number
  activeSegmentId?: string | null
}>()

const { t } = useI18n()
const host = ref<HTMLElement | null>(null)
const loading = ref(false)
const refreshing = ref(false)
const hasContent = ref(false)
const error = ref('')
let gen = 0
let segmentIndex = new Map<string, HTMLElement>()
let pendingPreviewScroll: number | null = null
let scrollSaveTimer: ReturnType<typeof setTimeout> | null = null
let hostScrollTarget: HTMLElement | null = null

function loadPendingPreviewScroll() {
  const snap = readEditorScroll(props.projectId)
  pendingPreviewScroll = snap?.previewY ?? null
}

function applyHighlight(scroll = false) {
  if (!host.value) return
  highlightPreviewSegment(host.value, segmentIndex, props.activeSegmentId ?? null, { scroll })
}

function schedulePreviewScrollPersist() {
  if (!host.value) return
  if (scrollSaveTimer) clearTimeout(scrollSaveTimer)
  scrollSaveTimer = setTimeout(() => {
    if (!host.value) return
    writeEditorScroll(props.projectId, { previewY: host.value.scrollTop })
  }, 200)
}

function onHostScroll() {
  schedulePreviewScrollPersist()
}

function bindHostScroll(el: HTMLElement | null) {
  if (hostScrollTarget) {
    hostScrollTarget.removeEventListener('scroll', onHostScroll)
    hostScrollTarget = null
  }
  if (!el) return
  el.addEventListener('scroll', onHostScroll, { passive: true })
  hostScrollTarget = el
}

async function renderPreview() {
  if (!host.value) return
  const run = ++gen
  const isRefresh = hasContent.value
  if (isRefresh) refreshing.value = true
  else loading.value = true
  error.value = ''

  try {
    const blob = await buildTranslatedDocx(props.record.docx, props.record.segments)
    if (run !== gen || !host.value) return

    const staging = document.createElement('div')
    await renderAsync(blob, staging, undefined, {
      className: 'docx',
      inWrapper: true,
      breakPages: true,
      ignoreLastRenderedPageBreak: true,
    })
    if (run !== gen || !host.value) return

    let scrollTop = host.value.scrollTop
    if (!isRefresh && pendingPreviewScroll !== null) {
      scrollTop = pendingPreviewScroll
      pendingPreviewScroll = null
    }
    const pageScrollY = window.scrollY
    host.value.replaceChildren(...staging.childNodes)
    host.value.scrollTop = scrollTop
    window.scrollTo(0, pageScrollY)
    hasContent.value = true
    segmentIndex = indexPreviewSegments(host.value, props.record.segments)
    applyHighlight(false)
  } catch (e) {
    if (run === gen) {
      error.value = e instanceof Error ? e.message : String(e)
      segmentIndex = new Map()
    }
  } finally {
    if (run === gen) {
      loading.value = false
      refreshing.value = false
    }
  }
}

loadPendingPreviewScroll()

watch(
  () => props.projectId,
  () => {
    loadPendingPreviewScroll()
    hasContent.value = false
  },
)

watch(host, (el) => bindHostScroll(el), { immediate: true })

watch(
  () => props.refreshToken,
  () => nextTick(() => renderPreview()),
  { immediate: true },
)

watch(
  () => props.activeSegmentId,
  () => applyHighlight(true),
)

onBeforeUnmount(() => {
  gen++
  bindHostScroll(null)
  if (scrollSaveTimer) clearTimeout(scrollSaveTimer)
  if (host.value) {
    writeEditorScroll(props.projectId, { previewY: host.value.scrollTop })
  }
})
</script>

<template>
  <aside class="preview-panel" aria-label="preview">
    <div class="preview-head">
      <h2 class="preview-title">{{ t('editor.previewTitle') }}</h2>
      <p class="preview-hint">{{ t('editor.previewHint') }}</p>
    </div>
    <p v-if="error" class="preview-error">{{ error }}</p>
    <div class="preview-body">
      <div
        v-if="loading && !hasContent"
        class="preview-status"
        aria-live="polite"
      >
        {{ t('editor.previewLoading') }}
      </div>
      <div ref="host" class="preview-host docx-host" />
      <div
        v-if="refreshing"
        class="preview-refresh"
        aria-hidden="true"
      >
        <span class="preview-refresh-spinner" />
      </div>
    </div>
  </aside>
</template>

<style scoped lang="scss">
.preview-panel {
  position: sticky;
  top: 4.5rem;
  align-self: start;
  max-height: calc(100vh - 5.5rem);
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--surface-soft);
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  overflow: hidden;
}

.preview-head {
  flex: 0 0 auto;
  padding: 0.75rem 0.9rem 0.55rem;
  border-bottom: 1px solid var(--border);
}

.preview-title {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text);
}

.preview-hint {
  margin: 0.35rem 0 0;
  font-size: 0.75rem;
  color: var(--text-faint);
  line-height: 1.35;
}

.preview-body {
  position: relative;
  flex: 1 1 auto;
  min-height: 12rem;
  display: flex;
  flex-direction: column;
}

.preview-status {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-muted);
  background: var(--preview-desk);
}

.preview-error {
  padding: 0.65rem 0.9rem;
  margin: 0;
  font-size: 0.8rem;
  color: var(--danger);
}

.preview-host {
  flex: 1 1 auto;
  overflow: auto;
  padding: 1rem 0.75rem;
  background: var(--preview-desk);
}

.preview-refresh {
  position: absolute;
  top: 0.65rem;
  right: 0.65rem;
  z-index: 2;
  pointer-events: none;
}

.preview-refresh-spinner {
  display: block;
  width: 1rem;
  height: 1rem;
  border: 2px solid var(--spinner-track);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: preview-spin 0.7s linear infinite;
  opacity: 0.85;
}

@keyframes preview-spin {
  to {
    transform: rotate(360deg);
  }
}

.docx-host :deep(.docx-wrapper) {
  margin: 0 auto;
  padding: 0.25rem 0 0 !important;
  background: transparent !important;
  border-radius: 2px;
  box-shadow: none;
}

.docx-host :deep(.docx-wrapper > section.docx) {
  background: #fff !important;
  border-radius: 2px;
  box-shadow: var(--preview-page-shadow) !important;
  margin-bottom: 1rem !important;
}

.docx-host :deep(p.appzac-preview-hit) {
  background: var(--preview-hit-bg);
  border-radius: 2px;
  transition: background 0.15s ease;
}
</style>
