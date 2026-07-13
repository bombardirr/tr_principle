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
const scroller = ref<HTMLElement | null>(null)
const host = ref<HTMLElement | null>(null)
const loading = ref(false)
const refreshing = ref(false)
const hasContent = ref(false)
const error = ref('')
let gen = 0
let segmentIndex = new Map<string, HTMLElement>()
let pendingPreviewScroll: number | null = null
let scrollSaveTimer: ReturnType<typeof setTimeout> | null = null
let scrollerScrollTarget: HTMLElement | null = null
let fitObserver: ResizeObserver | null = null
let lastPreviewScale = 1

function loadPendingPreviewScroll() {
  const snap = readEditorScroll(props.projectId)
  pendingPreviewScroll = snap?.previewY ?? null
}

function applyHighlight(scroll = false) {
  if (!scroller.value || !host.value) return
  highlightPreviewSegment(
    scroller.value,
    segmentIndex,
    props.record.segments,
    props.activeSegmentId ?? null,
    {
    scroll,
  })
}

function schedulePreviewScrollPersist() {
  if (!scroller.value) return
  if (scrollSaveTimer) clearTimeout(scrollSaveTimer)
  scrollSaveTimer = setTimeout(() => {
    if (!scroller.value) return
    writeEditorScroll(props.projectId, { previewY: scroller.value.scrollTop })
  }, 200)
}

function onScrollerScroll() {
  schedulePreviewScrollPersist()
}

function fitPreviewSheet() {
  if (!host.value || !scroller.value || !hasContent.value) return
  const wrapper = host.value.querySelector('.docx-wrapper') as HTMLElement | null
  if (!wrapper) return

  const prevScroll = scroller.value.scrollTop
  const prevScale = lastPreviewScale

  wrapper.style.transform = 'none'
  wrapper.style.transformOrigin = ''
  host.value.style.width = ''
  host.value.style.height = ''
  scroller.value.style.width = ''
  scroller.value.style.maxWidth = ''
  scroller.value.style.height = ''
  scroller.value.classList.remove('is-scrollable')

  const naturalWidth = wrapper.offsetWidth
  if (naturalWidth <= 0) return

  const layout = scroller.value.closest('.editor-layout') as HTMLElement | null
  const maxAvailable = layout?.clientWidth ?? naturalWidth
  const scale = Math.min(1, maxAvailable / naturalWidth)
  lastPreviewScale = scale

  const sheetWidth = naturalWidth * scale
  const sheetHeight = Math.ceil(wrapper.getBoundingClientRect().height * scale)
  const maxViewport = parseFloat(getComputedStyle(scroller.value).maxHeight)
  const viewportHeight = Number.isFinite(maxViewport)
    ? Math.min(sheetHeight, maxViewport)
    : sheetHeight

  wrapper.style.transformOrigin = 'top left'
  wrapper.style.transform = scale < 1 ? `scale(${scale})` : 'none'
  host.value.style.width = `${sheetWidth}px`
  host.value.style.height = `${sheetHeight}px`
  scroller.value.style.width = `${sheetWidth}px`
  scroller.value.style.maxWidth = '100%'
  scroller.value.style.height = `${viewportHeight}px`
  if (sheetHeight > viewportHeight) {
    scroller.value.classList.add('is-scrollable')
  }

  if (prevScale > 0 && prevScale !== scale && prevScroll > 0) {
    scroller.value.scrollTop = prevScroll * (scale / prevScale)
  }
}

function bindFitObserver(el: HTMLElement | null) {
  fitObserver?.disconnect()
  fitObserver = null
  if (!el) return
  const layout = el.closest('.editor-layout')
  if (!layout) return
  fitObserver = new ResizeObserver(() => fitPreviewSheet())
  fitObserver.observe(layout)
}

function bindScrollerScroll(el: HTMLElement | null) {
  if (scrollerScrollTarget) {
    scrollerScrollTarget.removeEventListener('scroll', onScrollerScroll)
    scrollerScrollTarget = null
  }
  if (!el) return
  el.addEventListener('scroll', onScrollerScroll, { passive: true })
  scrollerScrollTarget = el
}

async function renderPreview() {
  if (!host.value || !scroller.value) return
  const run = ++gen
  const isRefresh = hasContent.value
  if (isRefresh) refreshing.value = true
  else loading.value = true
  error.value = ''

  try {
    const blob = await buildTranslatedDocx(props.record.docx, props.record.segments)
    if (run !== gen || !host.value || !scroller.value) return

    const staging = document.createElement('div')
    await renderAsync(blob, staging, undefined, {
      className: 'docx',
      inWrapper: true,
      breakPages: true,
      ignoreLastRenderedPageBreak: true,
    })
    if (run !== gen || !host.value || !scroller.value) return

    let scrollTop = scroller.value.scrollTop
    if (!isRefresh && pendingPreviewScroll !== null) {
      scrollTop = pendingPreviewScroll
      pendingPreviewScroll = null
    }
    const pageScrollY = window.scrollY
    host.value.replaceChildren(...staging.childNodes)
    hasContent.value = true
    await nextTick()
    fitPreviewSheet()
    scroller.value.scrollTop = scrollTop
    window.scrollTo(0, pageScrollY)
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

watch(scroller, (el) => {
  bindScrollerScroll(el)
  bindFitObserver(el)
}, { immediate: true })

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
  bindScrollerScroll(null)
  bindFitObserver(null)
  if (scrollSaveTimer) clearTimeout(scrollSaveTimer)
  if (scroller.value) {
    writeEditorScroll(props.projectId, { previewY: scroller.value.scrollTop })
  }
})
</script>

<template>
  <aside class="preview-panel" aria-label="preview">
    <p v-if="error" class="preview-error">{{ error }}</p>
    <div ref="scroller" class="preview-body">
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
  width: fit-content;
  max-width: 100%;
  flex-shrink: 0;
  max-height: calc(100vh - 5.5rem);
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.preview-body {
  position: relative;
  flex: 0 0 auto;
  width: fit-content;
  max-width: 100%;
  max-height: calc(100vh - 5.5rem);
  overflow-x: hidden;
  overflow-y: hidden;
  overscroll-behavior: contain;
  border-radius: 6px;
  background: var(--preview-desk);
  isolation: isolate;
}

.preview-body.is-scrollable {
  overflow-y: auto;
  scrollbar-gutter: stable;
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
}

.preview-error {
  margin: 0;
  font-size: 0.8rem;
  color: var(--danger);
}

.preview-host {
  box-sizing: border-box;
  overflow: hidden;
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
  box-sizing: border-box;
  margin: 0;
  padding: 0 !important;
  background: transparent !important;
  border-radius: 0;
  box-shadow: none;
  overflow: hidden;
}

.docx-host :deep(.docx-wrapper > section.docx) {
  flex-shrink: 0;
  background: #fff !important;
  border-radius: 6px !important;
  box-shadow: var(--preview-page-shadow) !important;
  margin: 0 !important;
  overflow: hidden !important;
}

.docx-host :deep(.docx-wrapper > section.docx:not(:last-child)) {
  margin-bottom: 1rem !important;
}

.docx-host :deep(p.appzac-preview-done) {
  background: var(--preview-done-bg);
  border-radius: 2px;
}

.docx-host :deep(p.appzac-preview-hit) {
  background: var(--preview-hit-bg);
  border-radius: 2px;
  transition: background 0.15s ease;
}
</style>
