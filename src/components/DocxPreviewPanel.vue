<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { renderAsync } from 'docx-preview'
import { buildTranslatedDocx } from '@/docx/exportDocx'
import {
  highlightPreviewSegment,
  indexPreviewSegments,
  markPreviewSegments,
  resolvePreviewSegmentClick,
} from '@/docx/previewHighlight'
import { readEditorScroll, writeEditorScroll } from '@/storage/editorScroll'
import type { ProjectRecord } from '@/types/project'
import IconButton from '@/components/IconButton.vue'
import EditorGlyph from '@/components/EditorGlyph.vue'

type PreviewMode = 'target' | 'source'

const props = defineProps<{
  projectId: string
  record: ProjectRecord
  refreshToken: number
  activeSegmentId?: string | null
  /** Full-screen peek overlay (narrow editor). */
  overlay?: boolean
}>()

const emit = defineEmits<{
  selectSegment: [segmentId: string]
  close: []
}>()

const { t } = useI18n()
const scroller = ref<HTMLElement | null>(null)
const host = ref<HTMLElement | null>(null)
const loading = ref(false)
/** Shown only when initial load exceeds LOADING_MESSAGE_DELAY_MS. */
const showLoadingMessage = ref(false)
const refreshing = ref(false)
const hasContent = ref(false)
const error = ref('')
const mode = ref<PreviewMode>('target')
const LOADING_MESSAGE_DELAY_MS = 1000
let gen = 0
let segmentIndex = new Map<string, HTMLElement>()
let pendingTargetScroll: number | null = null
let pendingSourceScroll: number | null = null
let scrollSaveTimer: ReturnType<typeof setTimeout> | null = null
let loadingMessageTimer: ReturnType<typeof setTimeout> | null = null
let scrollerScrollTarget: HTMLElement | null = null
let fitObserver: ResizeObserver | null = null
let lastPreviewScale = 1
let scrollPreviewOnHighlight = true

function clearLoadingMessageTimer() {
  if (loadingMessageTimer) {
    clearTimeout(loadingMessageTimer)
    loadingMessageTimer = null
  }
}

function beginLoading() {
  loading.value = true
  showLoadingMessage.value = false
  clearLoadingMessageTimer()
  loadingMessageTimer = setTimeout(() => {
    loadingMessageTimer = null
    if (loading.value && !hasContent.value) showLoadingMessage.value = true
  }, LOADING_MESSAGE_DELAY_MS)
}

function endLoading() {
  loading.value = false
  showLoadingMessage.value = false
  clearLoadingMessageTimer()
}

const modeLabel = computed(() =>
  mode.value === 'source' ? t('editor.previewModeSource') : t('editor.previewModeTarget'),
)

const swapTitle = computed(() =>
  mode.value === 'source' ? t('editor.previewSwapToTarget') : t('editor.previewSwapToSource'),
)

function loadPendingPreviewScroll() {
  const snap = readEditorScroll(props.projectId)
  pendingTargetScroll = snap?.previewY ?? null
  pendingSourceScroll = snap?.previewSourceY ?? null
}

function persistCurrentScroll() {
  if (!scroller.value) return
  const y = scroller.value.scrollTop
  if (mode.value === 'source') {
    writeEditorScroll(props.projectId, { previewSourceY: y })
  } else {
    writeEditorScroll(props.projectId, { previewY: y })
  }
}

function onPreviewClick(e: MouseEvent) {
  if (mode.value !== 'target') return
  const segmentId = resolvePreviewSegmentClick(e.target)
  if (!segmentId) return
  scrollPreviewOnHighlight = false
  emit('selectSegment', segmentId)
}

function applyHighlight(scroll = false) {
  if (mode.value !== 'target') return
  if (!scroller.value || !host.value) return
  highlightPreviewSegment(
    scroller.value,
    segmentIndex,
    props.record.segments,
    props.activeSegmentId ?? null,
    { scroll },
  )
}

function schedulePreviewScrollPersist() {
  if (!scroller.value) return
  if (scrollSaveTimer) clearTimeout(scrollSaveTimer)
  scrollSaveTimer = setTimeout(() => persistCurrentScroll(), 200)
}

function onScrollerScroll() {
  schedulePreviewScrollPersist()
}

function scrollPreviewTo(edge: 'top' | 'bottom') {
  const el = scroller.value
  if (!el) return
  el.scrollTo({
    top: edge === 'top' ? 0 : el.scrollHeight,
    behavior: 'smooth',
  })
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
  const panel = scroller.value.closest('.preview-panel') as HTMLElement | null
  const maxAvailable =
    (props.overlay ? panel?.clientWidth : layout?.clientWidth) ?? naturalWidth
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
  const target = props.overlay
    ? el.closest('.preview-panel')
    : el.closest('.editor-layout')
  if (!target) return
  fitObserver = new ResizeObserver(() => fitPreviewSheet())
  fitObserver.observe(target)
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

async function previewBlob(): Promise<Blob> {
  if (mode.value === 'source') {
    return new Blob([props.record.docx], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
  }
  return buildTranslatedDocx(props.record.docx, props.record.segments)
}

/** docx-preview applies experimental tab stops on a 500ms timer — swap only after that. */
const TAB_STOP_SETTLE_MS = 520

function sleep(ms: number) {
  return new Promise<void>(resolve => {
    setTimeout(resolve, ms)
  })
}

async function renderPreview(options?: { forcePendingScroll?: boolean }) {
  if (!host.value || !scroller.value) return
  const run = ++gen
  const isRefresh = hasContent.value && !options?.forcePendingScroll
  if (isRefresh) refreshing.value = true
  else beginLoading()
  error.value = ''

  const staging = document.createElement('div')
  staging.className = 'preview-staging'
  staging.setAttribute('aria-hidden', 'true')
  scroller.value.appendChild(staging)

  try {
    const blob = await previewBlob()
    if (run !== gen || !host.value || !scroller.value) return

    await renderAsync(blob, staging, undefined, {
      className: 'docx',
      inWrapper: true,
      breakPages: true,
      ignoreLastRenderedPageBreak: true,
      // Real tab-stop positions (подпись / ФИО); without this tabs become a single em-space.
      experimental: true,
    })
    if (run !== gen || !host.value || !scroller.value) return

    // Keep the previous sheet visible until tab stops finish — avoids a style/margin jump.
    await sleep(TAB_STOP_SETTLE_MS)
    if (run !== gen || !host.value || !scroller.value) return

    let scrollTop = scroller.value.scrollTop
    if (!isRefresh || options?.forcePendingScroll) {
      if (mode.value === 'source') {
        if (pendingSourceScroll !== null) {
          scrollTop = pendingSourceScroll
          pendingSourceScroll = null
        } else {
          scrollTop = 0
        }
      } else if (pendingTargetScroll !== null) {
        scrollTop = pendingTargetScroll
        pendingTargetScroll = null
      }
    }
    const pageScrollY = window.scrollY
    const nextNodes = [...staging.childNodes]
    host.value.replaceChildren(...nextNodes)
    hasContent.value = true
    await nextTick()
    fitPreviewSheet()
    scroller.value.scrollTop = scrollTop
    window.scrollTo(0, pageScrollY)
    if (mode.value === 'target') {
      segmentIndex = indexPreviewSegments(host.value, props.record.segments)
      markPreviewSegments(segmentIndex)
      applyHighlight(false)
    } else {
      segmentIndex = new Map()
    }
  } catch (e) {
    if (run === gen) {
      error.value = e instanceof Error ? e.message : String(e)
      segmentIndex = new Map()
    }
  } finally {
    staging.remove()
    if (run === gen) {
      endLoading()
      refreshing.value = false
    }
  }
}

async function toggleMode() {
  if (!scroller.value) return
  persistCurrentScroll()
  const snap = readEditorScroll(props.projectId)
  if (mode.value === 'target') {
    pendingSourceScroll = snap?.previewSourceY ?? 0
    mode.value = 'source'
  } else {
    pendingTargetScroll = snap?.previewY ?? 0
    mode.value = 'target'
  }
  hasContent.value = false
  await renderPreview({ forcePendingScroll: true })
}

loadPendingPreviewScroll()

watch(
  () => props.projectId,
  () => {
    loadPendingPreviewScroll()
    hasContent.value = false
    mode.value = 'target'
  },
)

watch(scroller, (el) => {
  bindScrollerScroll(el)
  bindFitObserver(el)
}, { immediate: true })

watch(
  () => props.overlay,
  () => {
    nextTick(() => {
      bindFitObserver(scroller.value)
      fitPreviewSheet()
    })
  },
)

watch(
  () => props.refreshToken,
  () => {
    // Translation edits only affect result preview.
    if (mode.value !== 'target') return
    nextTick(() => renderPreview())
  },
  { immediate: true },
)

watch(
  () => props.activeSegmentId,
  () => {
    applyHighlight(scrollPreviewOnHighlight)
    scrollPreviewOnHighlight = true
  },
)

onBeforeUnmount(() => {
  gen++
  bindScrollerScroll(null)
  bindFitObserver(null)
  if (scrollSaveTimer) clearTimeout(scrollSaveTimer)
  clearLoadingMessageTimer()
  persistCurrentScroll()
})
</script>

<template>
  <aside
    class="preview-panel"
    :class="[
      mode === 'source' ? 'is-source' : 'is-target',
      { 'is-overlay': overlay },
    ]"
    :aria-label="modeLabel"
    :aria-modal="overlay || undefined"
    :role="overlay ? 'dialog' : undefined"
  >
    <div class="preview-chrome">
      <IconButton
        class="preview-swap"
        :title="swapTitle"
        ghost
        @mousedown.prevent
        @click="toggleMode"
      >
        <EditorGlyph name="swap" />
      </IconButton>
      <span class="preview-mode">{{ modeLabel }}</span>
      <div class="preview-chrome-end">
        <IconButton
          :title="t('editor.previewScrollTop')"
          ghost
          @mousedown.prevent
          @click="scrollPreviewTo('top')"
        >
          <EditorGlyph name="scroll-top" />
        </IconButton>
        <IconButton
          :title="t('editor.previewScrollBottom')"
          ghost
          @mousedown.prevent
          @click="scrollPreviewTo('bottom')"
        >
          <EditorGlyph name="scroll-bottom" />
        </IconButton>
        <IconButton
          v-if="overlay"
          :title="t('editor.previewOffHint')"
          ghost
          @mousedown.prevent
          @click="emit('close')"
        >
          <EditorGlyph name="close" />
        </IconButton>
      </div>
    </div>
    <p v-if="error" class="preview-error">{{ error }}</p>
    <div ref="scroller" class="preview-body">
      <div
        v-if="showLoadingMessage && !hasContent"
        class="preview-status"
        aria-live="polite"
      >
        {{ mode === 'source' ? t('editor.previewLoadingSource') : t('editor.previewLoading') }}
      </div>
      <div ref="host" class="preview-host docx-host" @click="onPreviewClick" />
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
  min-width: 0;
  flex-shrink: 1;
  max-height: calc(100vh - 5.5rem);
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.preview-panel.is-overlay {
  position: relative;
  top: auto;
  align-self: stretch;
  width: fit-content;
  max-width: 100%;
  max-height: none;
  height: 100%;
  min-height: 0;
}

.preview-chrome {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex: 0 0 auto;
  width: 100%;
  margin-bottom: 0.3rem;
  min-height: 1.6rem;
  padding: 0.1rem 0.2rem;
  border-radius: 5px;
  transition:
    background 0.18s ease,
    color 0.18s ease;
}

.preview-panel.is-source .preview-chrome {
  background: var(--preview-chrome-source-bg);
}

.preview-swap {
  flex: 0 0 auto;
}

.preview-mode {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  transition: color 0.18s ease;
}

.preview-panel.is-source .preview-mode {
  color: var(--preview-chrome-source-fg);
}

.preview-chrome-end {
  display: inline-flex;
  align-items: center;
  gap: 0.05rem;
  margin-left: auto;
  flex: 0 0 auto;
}

.preview-chrome :deep(.icon-btn) {
  width: 1.45rem;
  height: 1.45rem;
}

.preview-body {
  position: relative;
  flex: 0 0 auto;
  width: fit-content;
  max-width: 100%;
  max-height: calc(100vh - 7rem);
  overflow-x: hidden;
  overflow-y: hidden;
  overscroll-behavior: contain;
  border-radius: 6px;
  background: var(--preview-desk);
  isolation: isolate;
  box-shadow: inset 0 0 0 1px transparent;
  transition: box-shadow 0.18s ease;
}

.preview-staging {
  position: absolute;
  left: 0;
  top: 0;
  width: max(100%, 36rem);
  visibility: hidden;
  pointer-events: none;
  z-index: -1;
  overflow: hidden;
}

.preview-panel.is-overlay .preview-body {
  flex: 1 1 auto;
  width: fit-content;
  max-width: 100%;
  max-height: none;
  min-height: 0;
  margin: 0 auto;
  overflow-y: auto;
}

.preview-panel.is-source .preview-body {
  box-shadow: inset 0 0 0 1.5px var(--preview-frame-source);
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
  margin: 0 0 0.3rem;
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

.docx-host :deep([data-appzac-segment-id]) {
  cursor: pointer;
  border-radius: 2px;
  transition: background 0.15s ease;
}

/* Keep marker spans layout-neutral so Word run styles stay intact. */
.docx-host :deep(span.appzac-preview-seg) {
  display: inline;
  margin: 0;
  border: 0;
  font: inherit;
  letter-spacing: inherit;
  color: inherit;
  vertical-align: baseline;
}

.docx-host :deep(.appzac-preview-done) {
  background: var(--preview-done-bg);
}

.docx-host :deep(.appzac-preview-hit) {
  background: var(--preview-hit-bg);
}

.docx-host :deep([data-appzac-segment-id]:not(.appzac-preview-done):hover) {
  background: var(--preview-hit-bg);
}
</style>
