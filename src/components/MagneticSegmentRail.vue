<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { pickMagnetRowId } from '@/editor/magnetGeometry'
import IconButton from './IconButton.vue'
import EditorGlyph from './EditorGlyph.vue'

const props = defineProps<{
  activeSegmentId: string | null
  hoverSegmentId: string | null
  /** Idle park target (first segment). */
  viewportAnchorId?: string | null
  leaveEmptyActive: boolean
  listEl: HTMLElement | null
  /** When true, rail is hidden (per-row stacked actions take over). */
  stacked?: boolean
}>()

const emit = defineEmits<{
  copy: [segId: string]
  leaveEmpty: [segId: string]
  reset: [segId: string]
  /** True while pointer is over the floating center cluster. */
  'rail-hover': [hovered: boolean]
}>()

const { t } = useI18n()
const cluster = ref<HTMLElement | null>(null)
/** Absolute Y of the cluster *center* within `.segment-list` (px). CSS uses translateY(-50%). */
const centerY = ref(0)
const dimmed = ref(true)
/** Disable CSS transition for scroll-follow / seeding; keep it for focus/hover retarget. */
const noMotion = ref(false)
let lastTargetId: string | null = null
/** Last segment that held focus — origin for the next focus slide. */
let lastFocusId: string | null = null

function targetId(): string | null {
  return pickMagnetRowId({
    activeId: props.activeSegmentId,
    hoverId: props.activeSegmentId ? null : props.hoverSegmentId,
    viewportAnchorId: props.viewportAnchorId,
  })
}

/** Mid Y of source/target panes relative to the list's content origin. */
function paneCenterYInList(list: HTMLElement, row: HTMLElement): number | null {
  const source = row.querySelector('.source-pane') as HTMLElement | null
  const target = row.querySelector('.target-pane') as HTMLElement | null
  if (!source && !target) return null
  const listRect = list.getBoundingClientRect()
  const a = (source ?? target)!.getBoundingClientRect()
  const b = (target ?? source)!.getBoundingClientRect()
  const mid = (Math.min(a.top, b.top) + Math.max(a.bottom, b.bottom)) / 2
  return mid - listRect.top + list.scrollTop
}

function centerForSegment(list: HTMLElement, id: string): number | null {
  const row = document.getElementById(`segment-${id}`)
  if (!row || !list.contains(row)) return null
  return paneCenterYInList(list, row)
}

function measure(opts?: { instant?: boolean }) {
  if (props.stacked) return
  const list = props.listEl
  const id = targetId()
  dimmed.value = Boolean(id && !props.activeSegmentId)
  if (!list || !id || !cluster.value) return
  const row = document.getElementById(`segment-${id}`)
  if (!row || !list.contains(row)) return
  const paneCenter = paneCenterYInList(list, row)
  if (paneCenter == null) return

  const sameTarget = id === lastTargetId
  if (sameTarget && Math.abs(paneCenter - centerY.value) < 0.5) {
    observeTargetRow(row)
    return
  }

  // Same target (scroll/resize): stick without easing. New target: slide.
  const instant = opts?.instant ?? sameTarget
  if (instant) {
    noMotion.value = true
    centerY.value = paneCenter
    // Flush so the next animated move starts from this Y.
    void cluster.value.offsetHeight
    noMotion.value = false
  } else {
    noMotion.value = false
    centerY.value = paneCenter
  }
  lastTargetId = id
  observeTargetRow(row)
}

/**
 * Focus change: seed at the previous focus row (no motion), then slide to the new active row.
 * Idle / hover retarget keep normal sliding from the current visual position.
 */
function onActiveChange(id: string | null, prev: string | null | undefined) {
  if (prev) lastFocusId = prev

  if (id && lastFocusId && lastFocusId !== id && props.listEl) {
    const from = centerForSegment(props.listEl, lastFocusId)
    if (from != null) {
      noMotion.value = true
      centerY.value = from
      lastTargetId = lastFocusId
      if (cluster.value) void cluster.value.offsetHeight
      noMotion.value = false
      void nextTick(() => {
        requestAnimationFrame(() => measure({ instant: false }))
      })
      return
    }
  }

  remasureSoon()
}

let rowRo: ResizeObserver | null = null
let observedRow: HTMLElement | null = null

function observeTargetRow(row: HTMLElement) {
  if (observedRow === row) return
  rowRo?.disconnect()
  observedRow = row
  if (!rowRo) rowRo = new ResizeObserver(() => measure({ instant: true }))
  rowRo.observe(row)
  const source = row.querySelector('.source-pane')
  const target = row.querySelector('.target-pane')
  if (source) rowRo.observe(source)
  if (target) rowRo.observe(target)
}

function onAction(kind: 'copy' | 'leaveEmpty' | 'reset') {
  const id = targetId()
  if (!id) return
  if (kind === 'copy') emit('copy', id)
  else if (kind === 'leaveEmpty') emit('leaveEmpty', id)
  else emit('reset', id)
}

let ro: ResizeObserver | null = null
let scrollParents: HTMLElement[] = []

function onScrollOrResize() {
  measure({ instant: true })
}

function bindScroll() {
  for (const el of scrollParents) el.removeEventListener('scroll', onScrollOrResize)
  scrollParents = []
  let node: HTMLElement | null = props.listEl
  while (node) {
    scrollParents.push(node)
    node.addEventListener('scroll', onScrollOrResize, { passive: true })
    node = node.parentElement
  }
  window.addEventListener('scroll', onScrollOrResize, { passive: true })
  window.addEventListener('resize', onScrollOrResize)
}

function unbindScroll() {
  for (const el of scrollParents) el.removeEventListener('scroll', onScrollOrResize)
  scrollParents = []
  window.removeEventListener('scroll', onScrollOrResize)
  window.removeEventListener('resize', onScrollOrResize)
}

function remasureSoon() {
  lastTargetId = null
  void nextTick(() => {
    measure({ instant: false })
    requestAnimationFrame(() => measure({ instant: false }))
  })
}

onMounted(() => {
  bindScroll()
  ro = new ResizeObserver(() => measure({ instant: true }))
  if (props.listEl) ro.observe(props.listEl)
  remasureSoon()
})

onUnmounted(() => {
  unbindScroll()
  ro?.disconnect()
  ro = null
  rowRo?.disconnect()
  rowRo = null
  observedRow = null
})

watch(() => props.activeSegmentId, (id, prev) => onActiveChange(id, prev))
watch(
  () => props.hoverSegmentId,
  () => {
    if (props.activeSegmentId) return
    remasureSoon()
  },
)
watch(
  () => props.viewportAnchorId,
  () => {
    if (props.activeSegmentId || props.hoverSegmentId) return
    remasureSoon()
  },
)
watch(
  () => props.listEl,
  () => {
    unbindScroll()
    bindScroll()
    if (props.listEl && ro) {
      ro.disconnect()
      ro.observe(props.listEl)
    }
    remasureSoon()
  },
)
watch(() => props.stacked, remasureSoon)
</script>

<template>
  <div v-show="!stacked" class="magnetic-rail">
    <div
      ref="cluster"
      class="magnetic-cluster"
      :class="{ dimmed, 'no-motion': noMotion }"
      :style="{ top: `${centerY}px` }"
    >
      <div
        class="magnetic-cluster-hit"
        role="toolbar"
        :aria-label="t('editor.pairActionsLabel')"
        @mouseenter="emit('rail-hover', true)"
        @mouseleave="emit('rail-hover', false)"
      >
        <IconButton :title="t('editor.copySourceHint')" @mousedown.prevent @click="onAction('copy')">
          <EditorGlyph name="copy" />
        </IconButton>
        <IconButton
          :title="t('editor.leaveEmptyHint')"
          :active="leaveEmptyActive"
          @mousedown.prevent
          @click="onAction('leaveEmpty')"
        >
          <EditorGlyph name="leave-empty" />
        </IconButton>
        <IconButton :title="t('editor.resetTargetHint')" @mousedown.prevent @click="onAction('reset')">
          <EditorGlyph name="reset" />
        </IconButton>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.magnetic-rail {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2rem;
  margin-left: -1rem;
  pointer-events: none;
  z-index: 3;
}

.magnetic-cluster {
  position: absolute;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  pointer-events: none;
  /* `top` is the pane mid-line; -50% centers the icon stack regardless of hit padding/margins. */
  transform: translateY(-50%);
  will-change: top;
  transition: top 180ms ease;
}

.magnetic-cluster.no-motion {
  transition: none;
}

.magnetic-cluster-hit {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  align-items: center;
  pointer-events: auto;
  padding: 0.65rem 0.35rem;
  margin: -0.65rem -0.35rem;
  transition: opacity 150ms ease;
}

.magnetic-cluster.dimmed .magnetic-cluster-hit {
  opacity: 0.35;
}

.magnetic-cluster-hit :deep(.icon-btn) {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 6px;
}

.magnetic-cluster-hit :deep(.icon-btn.active) {
  color: var(--accent);
}
</style>
