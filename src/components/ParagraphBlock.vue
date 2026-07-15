<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TmMatch, TmUnit } from '@/types/tm'
import type { Segment } from '@/types/project'
import IconButton from './IconButton.vue'
import EditorGlyph from './EditorGlyph.vue'
import TaggedEditor from './TaggedEditor.vue'
import TmVariantPicker from './TmVariantPicker.vue'
import SegmentAuditPopover from './SegmentAuditPopover.vue'
import TmConcordancePanel from './TmConcordancePanel.vue'
import { FEATURE_TM_CONCORDANCE } from '@/features'
import { extractTagIds } from '@/docx/tags'
import { plainSource } from '@/tm/fragments'
import { isSegmentTranslated } from '@/utils/segmentStatus'
import { resolveSegmentKinds, type SegmentKind } from '@/utils/segmentKind'

const props = defineProps<{
  segments: Segment[]
  /** 1-based index shown in the editor (document order). */
  displayIndex?: number
  activeSegmentId?: string | null
  matchesFor: (seg: Segment) => TmMatch[]
  needsTmSave: (seg: Segment) => boolean
  tmUnits?: TmUnit[]
  canUndo?: (segId: string) => boolean
  canRedo?: (segId: string) => boolean
  redoCount?: (segId: string) => number
}>()

const emit = defineEmits<{
  updateTarget: [segId: string, value: string]
  copySource: [segId: string]
  leaveEmpty: [segId: string]
  resetTarget: [segId: string]
  activate: [segId: string]
  applyTm: [segId: string, match: TmMatch]
  saveToTm: [segId: string]
  insertConcordance: [segId: string, target: string]
  undo: [segId: string]
  redo: [segId: string]
}>()

/** Per-block: chips only after toggle on this row. */
const showMarkers = ref(false)

const showConcordance = FEATURE_TM_CONCORDANCE

const { t, locale } = useI18n()

const sorted = computed(() =>
  [...props.segments].sort((a, b) => a.sentenceIndex - b.sentenceIndex),
)

const activeId = computed(() => {
  if (props.activeSegmentId && sorted.value.some((s) => s.id === props.activeSegmentId)) {
    return props.activeSegmentId
  }
  return sorted.value[0]?.id ?? ''
})

const activeSeg = computed(() => sorted.value.find((s) => s.id === activeId.value) ?? sorted.value[0])

const kinds = computed(() => (activeSeg.value ? resolveSegmentKinds(activeSeg.value) : []))

const displayId = computed(() => {
  if (props.displayIndex != null) return String(props.displayIndex)
  const first = sorted.value[0]?.id ?? ''
  return first.replace(/^seg-/, '')
})

const editors = ref<Record<string, { focus: () => void; sync: () => void; blur: () => void } | null>>(
  {},
)

watch(
  () => props.activeSegmentId,
  (id) => {
    if (!id) return
    nextTick(() => editors.value[id]?.focus())
  },
)

function kindClass(kind: SegmentKind) {
  return `seg-kind--${kind}`
}

function filled(seg: Segment) {
  return isSegmentTranslated(seg)
}

function onCopy() {
  if (!activeSeg.value) return
  emit('copySource', activeSeg.value.id)
  nextTick(() => {
    editors.value[activeSeg.value!.id]?.sync()
    editors.value[activeSeg.value!.id]?.focus()
  })
}

function onLeaveEmpty() {
  if (!activeSeg.value) return
  emit('leaveEmpty', activeSeg.value.id)
  nextTick(() => editors.value[activeSeg.value!.id]?.blur())
}

function onReset() {
  if (!activeSeg.value) return
  emit('resetTarget', activeSeg.value.id)
  nextTick(() => editors.value[activeSeg.value!.id]?.blur())
}

function onPick(seg: Segment, match: TmMatch) {
  emit('applyTm', seg.id, match)
  nextTick(() => {
    editors.value[seg.id]?.sync()
    editors.value[seg.id]?.focus()
  })
}

function canSaveToTm(seg: Segment | undefined) {
  return Boolean(seg && props.needsTmSave(seg))
}

function onSaveToTm() {
  if (!activeSeg.value || !canSaveToTm(activeSeg.value)) return
  emit('saveToTm', activeSeg.value.id)
}

const concordanceSeed = computed(() =>
  activeSeg.value ? plainSource(activeSeg.value.source) : '',
)

function segmentHasMarkers(seg: Segment) {
  return extractTagIds(seg.source).length > 0 || extractTagIds(seg.target).length > 0
}

const blockHasMarkers = computed(() => sorted.value.some(segmentHasMarkers))

watch(blockHasMarkers, (ok) => {
  if (!ok) showMarkers.value = false
})

const markersToggleTitle = computed(() => {
  if (!blockHasMarkers.value) return t('editor.markersNoneHint')
  return showMarkers.value ? t('editor.markersHideHint') : t('editor.markersShowHint')
})

function toggleMarkers() {
  if (!blockHasMarkers.value) return
  showMarkers.value = !showMarkers.value
}

/** One-shot class so the markers button flashes on row hover (CSS :hover was easy to miss). */
const markersFlash = ref(false)
let markersFlashTimer: ReturnType<typeof setTimeout> | null = null

function onRowPointerEnter() {
  if (!blockHasMarkers.value || showMarkers.value) return
  markersFlash.value = false
  // Double rAF so the class clears a frame before restart (restarts CSS animation).
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      markersFlash.value = true
      if (markersFlashTimer) clearTimeout(markersFlashTimer)
      markersFlashTimer = setTimeout(() => {
        markersFlash.value = false
        markersFlashTimer = null
      }, 300)
    })
  })
}

const concordanceOpen = ref(false)

function onConcordanceOpenChange(open: boolean) {
  concordanceOpen.value = open
}

function onConcordanceInsert(target: string) {
  if (!activeSeg.value) return
  concordanceOpen.value = false
  emit('insertConcordance', activeSeg.value.id, target)
  nextTick(() => {
    editors.value[activeSeg.value!.id]?.sync()
    editors.value[activeSeg.value!.id]?.focus()
  })
}

function undoAvailable(segId: string) {
  return props.canUndo?.(segId) ?? false
}

function redoAvailable(segId: string) {
  return props.canRedo?.(segId) ?? false
}

function stepsToTip(segId: string) {
  return props.redoCount?.(segId) ?? 0
}

function onUndo() {
  if (!activeSeg.value || !undoAvailable(activeSeg.value.id)) return
  emit('undo', activeSeg.value.id)
  nextTick(() => {
    editors.value[activeSeg.value!.id]?.sync()
    editors.value[activeSeg.value!.id]?.focus()
  })
}

function onRedo() {
  if (!activeSeg.value || !redoAvailable(activeSeg.value.id)) return
  emit('redo', activeSeg.value.id)
  nextTick(() => {
    editors.value[activeSeg.value!.id]?.sync()
    editors.value[activeSeg.value!.id]?.focus()
  })
}
</script>

<template>
  <article
    :id="`segment-${sorted[0]?.id}`"
    class="row"
    :class="{
      active: sorted.some((s) => s.id === activeSegmentId),
      'concordance-open': concordanceOpen,
      'has-markers': blockHasMarkers,
    }"
    @pointerenter="onRowPointerEnter"
  >
    <div class="meta">
      <div class="meta-source">
        <span class="seg-id">{{ displayId }}</span>
        <span v-if="kinds.length">
          <span class="meta-sep" aria-hidden="true">·</span>
          <span v-for="kind in kinds" :key="kind" class="seg-kind" :class="kindClass(kind)">
            {{ t(`editor.kind.${kind}`) }}
          </span>
        </span>
      </div>
      <div
        class="meta-center"
        role="toolbar"
        :aria-label="t('editor.markersToggleLabel')"
      >
        <IconButton
          :class="['markers-btn', { 'markers-flash': markersFlash }]"
          :title="markersToggleTitle"
          :active="showMarkers && blockHasMarkers"
          :disabled="!blockHasMarkers"
          @mousedown.prevent
          @click="toggleMarkers"
        >
          <EditorGlyph name="markers" />
        </IconButton>
        <TmConcordancePanel
          v-if="showConcordance"
          :units="tmUnits ?? []"
          :seed-query="concordanceSeed"
          :enabled="!!activeSeg"
          @insert="onConcordanceInsert"
          @open-change="onConcordanceOpenChange"
        />
        <SegmentAuditPopover :entries="activeSeg?.audit ?? []" />
      </div>
      <div class="meta-target">
        <TmVariantPicker
          :matches="activeSeg ? matchesFor(activeSeg) : []"
          :current-target="activeSeg?.target ?? ''"
          @pick="activeSeg && onPick(activeSeg, $event)"
        />
        <div
          v-if="activeSeg"
          class="seg-history"
          role="group"
          :aria-label="t('editor.undoHint')"
        >
          <IconButton
            :title="t('editor.undoHint')"
            :disabled="!undoAvailable(activeSeg.id)"
            @mousedown.prevent
            @click="onUndo"
          >
            <EditorGlyph name="undo" />
          </IconButton>
          <IconButton
            class="redo-btn"
            :title="
              stepsToTip(activeSeg.id) > 0
                ? t('editor.redoStepsHint', { n: stepsToTip(activeSeg.id) })
                : t('editor.redoHint')
            "
            :disabled="!redoAvailable(activeSeg.id)"
            @mousedown.prevent
            @click="onRedo"
          >
            <EditorGlyph name="redo" />
            <span
              v-if="stepsToTip(activeSeg.id) > 0"
              class="redo-badge"
              aria-hidden="true"
            >{{ stepsToTip(activeSeg.id) }}</span>
          </IconButton>
        </div>
        <IconButton
          v-show="canSaveToTm(activeSeg)"
          class="tm-save-btn"
          :title="t('editor.tmCommitHint')"
          @mousedown.prevent
          @click="onSaveToTm"
        >
          <EditorGlyph name="tm-commit" />
        </IconButton>
      </div>
    </div>

    <div class="segment-workspace">
      <div class="pane source-pane" :class="{ filled: sorted[0] && filled(sorted[0]) }">
        <div
          v-for="seg in sorted"
          :key="`src-${seg.id}`"
          class="slot"
          :class="{ 'slot-active': seg.id === activeId }"
          @mousedown="emit('activate', seg.id)"
        >
          <TaggedEditor
            :model-value="seg.source"
            :spans="seg.spans"
            :locale="locale"
            :editable="false"
            :show-markers="showMarkers"
          />
        </div>
      </div>

      <div class="mid-toolbar" role="toolbar" :aria-label="displayId">
        <IconButton :title="t('editor.copySourceHint')" @mousedown.prevent @click="onCopy">
          <EditorGlyph name="copy" />
        </IconButton>
        <IconButton
          :title="t('editor.leaveEmptyHint')"
          :active="activeSeg ? filled(activeSeg) : false"
          @mousedown.prevent
          @click="onLeaveEmpty"
        >
          <EditorGlyph name="leave-empty" />
        </IconButton>
        <IconButton :title="t('editor.resetTargetHint')" @mousedown.prevent @click="onReset">
          <EditorGlyph name="reset" />
        </IconButton>
      </div>

      <div
        class="pane target-pane"
        :class="{ filled: sorted[0] && filled(sorted[0]) }"
      >
        <div
          v-for="seg in sorted"
          :key="`tgt-${seg.id}`"
          class="slot target-slot"
          :class="{ 'slot-active': seg.id === activeId }"
          @mousedown="emit('activate', seg.id)"
          @focusin="emit('activate', seg.id)"
        >
          <TaggedEditor
            :ref="(el) => { editors[seg.id] = el as any }"
            :model-value="seg.target"
            :spans="seg.spans"
            :locale="locale"
            :placeholder="t('editor.sentencePlaceholder')"
            :show-markers="showMarkers"
            @update:model-value="emit('updateTarget', seg.id, $event)"
          />
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped lang="scss">
$row-grid: 1fr auto 1fr;
$row-gap: 0.65rem;
$toolbar-icon-size: 1.75rem;
$toolbar-col-width: 2rem;

.row {
  border-radius: 12px;
  padding: 0.85rem 1rem;
  margin-bottom: 0;
  scroll-margin-top: 5rem;
  scroll-margin-bottom: 1.5rem;
}

.row.active {
  box-shadow: 0 0 0 2px rgba(91, 159, 212, 0.35);
}

.meta {
  display: grid;
  grid-template-columns: $row-grid;
  column-gap: $row-gap;
  align-items: center;
  margin-bottom: 0.45rem;
  font-size: 0.8rem;
  /* Keep row height stable when badge / TM-save appear */
  min-height: 1.5rem;
}

.meta-source,
.meta-target {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
  min-height: 1.5rem;
}

.meta-source {
  flex-wrap: wrap;
}

.meta-center {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 0.2rem;
  justify-self: center;
  min-width: $toolbar-col-width;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
}

.row:hover .meta-center,
.row.active .meta-center,
.row.concordance-open .meta-center,
.meta-center:focus-within,
.meta-center:has(.markers-flash) {
  opacity: 1;
  pointer-events: auto;
}

.meta-center :deep(.icon-btn) {
  width: 1.5rem;
  height: 1.5rem;
}

.meta-center :deep(.icon-btn.active) {
  color: var(--accent);
}

/* Triggered via .markers-flash (pointerenter) — class lands on IconButton root. */
.meta-center :deep(.markers-btn.markers-flash) {
  animation: markers-hover-flash 0.28s ease-out;
}

@keyframes markers-hover-flash {
  0% {
    color: var(--text-muted);
    filter: none;
    text-shadow: none;
  }
  30% {
    color: #9fe8ff;
    filter: drop-shadow(0 0 2px #fff) drop-shadow(0 0 6px #5b9fd4)
      drop-shadow(0 0 14px #3d8ecf) drop-shadow(0 0 22px rgba(91, 159, 212, 0.85));
    text-shadow:
      0 0 4px #fff,
      0 0 10px #7ec8ff,
      0 0 18px #5b9fd4;
  }
  100% {
    color: var(--text-muted);
    filter: none;
    text-shadow: none;
  }
}

.meta-target {
  flex-wrap: nowrap;
  justify-content: flex-start;
}

.tm-save-btn {
  flex: 0 0 auto;
}

.seg-history {
  display: inline-flex;
  align-items: center;
  gap: 0.1rem;
  margin-left: auto;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
}

.row:hover .seg-history,
.row.active .seg-history,
.seg-history:focus-within {
  opacity: 1;
  pointer-events: auto;
}

.redo-btn {
  position: relative;
}

.redo-badge {
  position: absolute;
  top: -0.05rem;
  right: -0.1rem;
  min-width: 0.7rem;
  height: 0.7rem;
  padding: 0 0.12rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text-muted) 22%, var(--surface));
  color: var(--text-muted);
  font-size: 0.5rem;
  font-weight: 600;
  line-height: 0.7rem;
  text-align: center;
  pointer-events: none;
}

.tm-save-btn :deep(.icon-btn),
.meta-target :deep(.icon-btn) {
  width: 1.5rem;
  height: 1.5rem;
}

.seg-id {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.meta-sep {
  color: var(--border-strong);
  font-weight: 600;
  line-height: 1;
  user-select: none;
}

.seg-kind {
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.seg-kind--table {
  color: var(--kind-table);
}
.seg-kind--header {
  color: var(--kind-header);
}
.seg-kind--footer {
  color: var(--kind-footer);
}
.seg-kind--footnote {
  color: var(--kind-footnote);
}
.seg-kind--endnote {
  color: var(--kind-endnote);
}
.seg-kind--comment {
  color: var(--kind-comment);
}
.seg-kind--textbox {
  color: var(--kind-textbox);
}
.seg-kind--caption {
  color: var(--kind-caption);
}

.segment-workspace {
  display: grid;
  grid-template-columns: $row-grid;
  column-gap: $row-gap;
  align-items: stretch;
}

.mid-toolbar {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 0.35rem;
  width: $toolbar-col-width;
  justify-self: center;
  padding: 0.2rem 0;
  align-self: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
}

.row:hover .mid-toolbar,
.row.active .mid-toolbar,
.row.concordance-open .mid-toolbar,
.mid-toolbar:focus-within {
  opacity: 1;
  pointer-events: auto;
}

.row.concordance-open {
  position: relative;
  z-index: 14;
}

.mid-toolbar :deep(.icon-btn) {
  width: $toolbar-icon-size;
  height: $toolbar-icon-size;
  border-radius: 6px;
}

.mid-toolbar :deep(.icon-btn.active) {
  color: var(--accent);
}

.pane {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  border-radius: 8px;
  padding: 0.45rem 0.55rem;
  line-height: 1.5;
  font-size: 0.95rem;
  color: var(--text);
  min-height: 6rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  background: var(--surface-2);
}

.target-pane {
  cursor: text;
}

.pane.filled {
  background: var(--target-filled-bg);
}

.slot {
  padding: 0.15rem 0;
}

@media (max-width: 800px) {
  .meta,
  .segment-workspace {
    grid-template-columns: 1fr;
    row-gap: 0.45rem;
  }

  .meta-center {
    justify-self: stretch;
    width: 100%;
  }

  .mid-toolbar {
    flex-direction: row;
    width: auto;
    justify-content: center;
  }
}
</style>
