<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TmMatch, TmUnit } from '@/types/tm'
import type { Segment } from '@/types/project'
import IconButton from './IconButton.vue'
import EditorGlyph from './EditorGlyph.vue'
import RichSourceView from './RichSourceView.vue'
import RichTargetEditor from './RichTargetEditor.vue'
import StyleToolbar from './StyleToolbar.vue'
import TmVariantPicker from './TmVariantPicker.vue'
import SegmentAuditPopover from './SegmentAuditPopover.vue'
import TmConcordancePanel from './TmConcordancePanel.vue'
import { FEATURE_TM_CONCORDANCE } from '@/features'
import { plainSource } from '@/tm/fragments'
import { isIntentionallyEmpty, isSegmentTranslated } from '@/utils/segmentStatus'
import { resolveSegmentKinds, type SegmentKind } from '@/utils/segmentKind'
import type { TargetStyleRange } from '@/types/project'
import { effectiveTargetStyles, type StyleApplyPatch } from '@/docx/runStyle'

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
  /** Bumps when targetStyles change externally (toolbar) so the editor can force-repaint. */
  stylePaintNonce?: number
  styleDisabled?: boolean
  hasStyleSelection?: boolean
  boldActive?: boolean
  italicActive?: boolean
  underlineActive?: boolean
  strikeActive?: boolean
  vertAlign?: 'superscript' | 'subscript' | null
  font?: string | null
  fontMixed?: boolean
  fontSizePt?: number | null
  fontSizeMixed?: boolean
  color?: string | null
  colorMixed?: boolean
  highlight?: string | null
  highlightMixed?: boolean
  fonts: string[]
  /** Force stacked chrome (overrides matchMedia when provided). */
  stacked?: boolean
  /** Idle hint: first segment in viewport (dimmed header icons, no focus). */
  viewportAnchorId?: string | null
  /** When false, hide dimmed viewport-anchor header icons (pointer is moving). */
  idleViewportChrome?: boolean
  /** Parent forces bright header centres (e.g. hovering the magnetic rail). */
  forceChromeReveal?: boolean
}>()

const emit = defineEmits<{
  updateTarget: [segId: string, value: string, styles?: TargetStyleRange[]]
  copySource: [segId: string]
  leaveEmpty: [segId: string]
  resetTarget: [segId: string]
  activate: [segId: string]
  applyTm: [segId: string, match: TmMatch]
  saveToTm: [segId: string]
  insertConcordance: [segId: string, target: string]
  undo: [segId: string]
  redo: [segId: string]
  targetSelection: [segId: string, range: { start: number; end: number; collapsed?: boolean } | null]
  rowHover: [segId: string | null]
  applyStyle: [patch: StyleApplyPatch]
}>()

const showConcordance = FEATURE_TM_CONCORDANCE

const { t } = useI18n()

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

/** Paint inherited source styles when targetStyles not yet stored. */
function displayTargetStyles(seg: Segment): TargetStyleRange[] {
  return effectiveTargetStyles(seg.target, seg.source, seg.spans, seg.targetStyles)
}

const mediaStacked = ref(false)
let mql: MediaQueryList | null = null

function onMqChange() {
  mediaStacked.value = mql?.matches ?? false
}

const isStacked = computed(() => props.stacked ?? mediaStacked.value)

onMounted(() => {
  mql = window.matchMedia('(max-width: 800px)')
  onMqChange()
  mql.addEventListener('change', onMqChange)
  // After session restore, activeSegmentId may be set before editors mount — focus then.
  const id = props.activeSegmentId
  if (id && sorted.value.some((s) => s.id === id)) {
    nextTick(() => editors.value[id]?.focus())
  }
})
onUnmounted(() => {
  mql?.removeEventListener('change', onMqChange)
})

watch(
  () => props.activeSegmentId,
  (id) => {
    if (!id) return
    nextTick(() => editors.value[id]?.focus())
  },
)

watch(
  () => props.stylePaintNonce,
  (nonce) => {
    if (!nonce) return
    nextTick(() => {
      for (const seg of sorted.value) {
        editors.value[seg.id]?.sync()
      }
    })
  },
)

function kindClass(kind: SegmentKind) {
  return `seg-kind--${kind}`
}

function filled(seg: Segment) {
  return isSegmentTranslated(seg)
}

function leaveEmptyActive(seg: Segment | undefined) {
  return Boolean(seg && isIntentionallyEmpty(seg))
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

function sourceSpansFor(seg: Segment) {
  return seg.paragraphSpans?.length ? seg.paragraphSpans : seg.spans
}

function onTargetUpdate(segId: string, value: string, styles?: TargetStyleRange[]) {
  emit('updateTarget', segId, value, styles)
}

function onTargetSelection(
  segId: string,
  range: { start: number; end: number; collapsed?: boolean } | null,
) {
  emit('targetSelection', segId, range)
}

const concordanceOpen = ref(false)
const auditOpen = ref(false)

/** Column “armed” by click — not only DOM focus inside an input. */
const columnFocus = ref<'source' | 'target' | null>(null)

function armColumn(which: 'source' | 'target') {
  columnFocus.value = which
  // Clicks on header chrome must activate the segment too (rail locks to active).
  const id = sorted.value[0]?.id
  if (id) emit('activate', id)
}

watch(
  () => props.activeSegmentId,
  (id) => {
    if (!id || !sorted.value.some((s) => s.id === id)) {
      columnFocus.value = null
    }
  },
)

function onConcordanceOpenChange(open: boolean) {
  concordanceOpen.value = open
}

function onAuditOpenChange(open: boolean) {
  auditOpen.value = open
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

function onRowEnter() {
  emit('rowHover', sorted.value[0]?.id ?? null)
}

function onRowLeave(e: MouseEvent) {
  const related = e.relatedTarget
  if (related instanceof Element && related.closest('.magnetic-rail, .magnetic-cluster')) return
  emit('rowHover', null)
}

/** While another segment is active, don't reveal header icons on hover of this row. */
const ownsChromeReveal = computed(() => {
  const active = props.activeSegmentId
  if (!active) return true
  return sorted.value.some((s) => s.id === active)
})

const isViewportAnchor = computed(() => {
  const id = props.viewportAnchorId
  return Boolean(id && sorted.value.some((s) => s.id === id))
})

const showIdleViewportChrome = computed(
  () => isViewportAnchor.value && props.idleViewportChrome !== false,
)

</script>

<template>
  <article
    :id="`segment-${sorted[0]?.id}`"
    class="row"
    :class="{
      active: sorted.some((s) => s.id === activeSegmentId),
      'concordance-open': concordanceOpen,
      'audit-open': auditOpen,
      'owns-chrome': ownsChromeReveal,
      'viewport-anchor': showIdleViewportChrome,
      'force-chrome': !!forceChromeReveal,
      stacked: isStacked,
    }"
    @mouseenter="onRowEnter"
    @mouseleave="onRowLeave($event)"
  >
    <div class="segment-workspace">
      <div
        class="col source-col"
        :class="{ 'col--armed': columnFocus === 'source' }"
        @mousedown="armColumn('source')"
      >
        <div class="source-header">
          <div class="header-start">
            <span class="seg-id">{{ displayId }}</span>
            <span v-if="kinds.length" class="kinds">
              <span class="meta-sep" aria-hidden="true">·</span>
              <span v-for="kind in kinds" :key="kind" class="seg-kind" :class="kindClass(kind)">
                {{ t(`editor.kind.${kind}`) }}
              </span>
            </span>
          </div>
          <div class="header-center header-center--reveal" role="toolbar" :aria-label="displayId">
            <TmConcordancePanel
              v-if="showConcordance"
              :units="tmUnits ?? []"
              :seed-query="concordanceSeed"
              :enabled="!!activeSeg"
              @insert="onConcordanceInsert"
              @open-change="onConcordanceOpenChange"
            />
            <SegmentAuditPopover
              :entries="activeSeg?.audit ?? []"
              @open-change="onAuditOpenChange"
            />
          </div>
          <div class="header-end" aria-hidden="true" />
        </div>
        <div
          class="pane source-pane"
          :class="{ filled: sorted[0] && filled(sorted[0]) }"
        >
          <div
            v-for="seg in sorted"
            :key="`src-${seg.id}`"
            class="slot"
            :class="{ 'slot-active': seg.id === activeId }"
            @mousedown="emit('activate', seg.id)"
          >
            <RichSourceView
              :tagged-source="seg.source"
              :spans="sourceSpansFor(seg)"
            />
          </div>
        </div>
      </div>

      <div
        class="rail-gutter"
        :class="{ 'rail-gutter--stacked': isStacked }"
        :aria-hidden="!isStacked"
        @mouseenter="emit('rowHover', sorted[0]?.id ?? null)"
      >
        <div
          v-if="isStacked"
          class="stacked-actions"
          role="toolbar"
          :aria-label="t('editor.pairActionsLabel')"
        >
          <IconButton :title="t('editor.copySourceHint')" @mousedown.prevent @click="onCopy">
            <EditorGlyph name="copy" />
          </IconButton>
          <IconButton
            :title="t('editor.leaveEmptyHint')"
            :active="leaveEmptyActive(activeSeg)"
            @mousedown.prevent
            @click="onLeaveEmpty"
          >
            <EditorGlyph name="leave-empty" />
          </IconButton>
          <IconButton :title="t('editor.resetTargetHint')" @mousedown.prevent @click="onReset">
            <EditorGlyph name="reset" />
          </IconButton>
        </div>
      </div>

      <div
        class="col target-col"
        :class="{ 'col--armed': columnFocus === 'target' }"
        @mousedown="armColumn('target')"
      >
        <div class="target-header">
          <div class="header-start">
            <TmVariantPicker
              :matches="activeSeg ? matchesFor(activeSeg) : []"
              :current-target="activeSeg?.target ?? ''"
              @pick="activeSeg && onPick(activeSeg, $event)"
            />
          </div>
          <div class="header-center header-center--reveal">
            <StyleToolbar
              :disabled="styleDisabled"
              :has-selection="!!hasStyleSelection"
              :bold-active="!!boldActive"
              :italic-active="!!italicActive"
              :underline-active="!!underlineActive"
              :strike-active="!!strikeActive"
              :vert-align="vertAlign"
              :font="font"
              :font-mixed="!!fontMixed"
              :font-size-pt="fontSizePt"
              :font-size-mixed="!!fontSizeMixed"
              :color="color"
              :color-mixed="!!colorMixed"
              :highlight="highlight"
              :highlight-mixed="!!highlightMixed"
              :fonts="fonts"
              @toggle="emit('applyStyle', { op: 'toggle', prop: $event })"
              @set-font="emit('applyStyle', { op: 'set', prop: 'font', value: $event })"
              @set-font-size-pt="
                emit('applyStyle', { op: 'set', prop: 'fontSizePt', value: $event })
              "
              @set-color="emit('applyStyle', { op: 'set', prop: 'color', value: $event })"
              @set-highlight="
                emit('applyStyle', { op: 'set', prop: 'highlight', value: $event })
              "
              @set-vert-align="
                emit('applyStyle', { op: 'set', prop: 'vertAlign', value: $event })
              "
            />
          </div>
          <div class="header-end">
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
            <RichTargetEditor
              :ref="(el) => { editors[seg.id] = el as any }"
              :model-value="seg.target"
              :styles="displayTargetStyles(seg)"
              @change="onTargetUpdate(seg.id, $event.target, $event.styles)"
              @selection-change="onTargetSelection(seg.id, $event)"
            />
          </div>
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped lang="scss">
$rail-col-width: 2rem;
$row-gap: 0.65rem;
$toolbar-icon-size: 1.75rem;

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

.row.concordance-open,
.row.audit-open {
  position: relative;
  z-index: 14;
}

.segment-workspace {
  display: grid;
  /* minmax(0,1fr): keep equal fluid columns; plain 1fr won't shrink below StyleToolbar min-content. */
  grid-template-columns: minmax(0, 1fr) $rail-col-width minmax(0, 1fr);
  grid-template-rows: auto minmax(6rem, auto);
  column-gap: $row-gap;
  row-gap: 0.35rem;
  align-items: stretch;
  min-width: 0;
  width: 100%;
}

/* Flatten columns into the parent grid so both panes share one row (same top). */
.source-col,
.target-col {
  display: contents;
}

.source-header {
  grid-column: 1;
  grid-row: 1;
}

.target-header {
  grid-column: 3;
  grid-row: 1;
}

.source-pane {
  grid-column: 1;
  grid-row: 2;
  min-width: 0;
}

.target-pane {
  grid-column: 3;
  grid-row: 2;
  min-width: 0;
}

.source-header,
.target-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.35rem;
  min-width: 0;
  min-height: 1.5rem;
  font-size: 0.8rem;
}

.header-start,
.header-center,
.header-end {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
}

.header-start {
  flex: 0 1 auto;
}

.header-center {
  justify-content: center;
  flex: 1 1 auto;
  overflow: hidden;
}

/* Search / audit / styles — hide by default. */
.source-col > .source-header > .header-center--reveal,
.target-col > .target-header > .header-center--reveal {
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s ease;
}

/* Idle: first segment in viewport shows dimmed icons (no focus / not clickable). */
.row.viewport-anchor .header-center--reveal {
  opacity: 0.35;
  pointer-events: none;
}

/*
 * Engaged: active segment (incl. restored from session), hover, focus, armed, popovers, rail.
 * Do not key off `.target-col:hover` — columns use `display: contents` and don't receive hover.
 */
.row.owns-chrome.active .header-center--reveal,
.row.owns-chrome:hover .header-center--reveal,
.row.owns-chrome:focus-within .header-center--reveal,
.row.owns-chrome:has(.col--armed) .header-center--reveal,
.row.owns-chrome.concordance-open .header-center--reveal,
.row.owns-chrome.audit-open .header-center--reveal,
.row.force-chrome .header-center--reveal {
  opacity: 1;
  pointer-events: auto;
}

.header-end {
  justify-content: flex-end;
  flex: 0 0 auto;
  margin-left: auto;
  gap: 0.15rem;
}

.kinds {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.rail-gutter {
  grid-column: 2;
  grid-row: 1 / span 2;
  width: $rail-col-width;
  justify-self: center;
  align-self: stretch;
  /* Keep a hoverable strip even when empty (desktop magnetic rail lives outside the row). */
  min-height: 100%;
}

.rail-gutter--stacked {
  width: auto;
  justify-self: stretch;
  display: flex;
  justify-content: center;
  padding: 0.15rem 0;
}

.stacked-actions {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
}

.stacked-actions :deep(.icon-btn) {
  width: $toolbar-icon-size;
  height: $toolbar-icon-size;
  border-radius: 6px;
}

.stacked-actions :deep(.icon-btn.active) {
  color: var(--accent);
}

.tm-save-btn {
  flex: 0 0 auto;
}

.seg-history {
  display: inline-flex;
  align-items: center;
  gap: 0.1rem;
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

.header-end :deep(.icon-btn),
.header-center :deep(.icon-btn) {
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

.pane {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.45rem 0.55rem;
  line-height: 1.5;
  font-size: 0.95rem;
  color: var(--text);
  min-height: 6rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  background: var(--surface);
}

.source-pane,
.target-pane {
  font-family: 'Times New Roman', Times, serif;
  font-size: 11pt;
  line-height: 1.35;
}

.target-pane {
  cursor: text;
  pointer-events: auto;
  background: var(--target-pane-bg);
  border-color: color-mix(in srgb, var(--accent) 28%, var(--border));
}

.source-pane.filled,
.target-pane.filled {
  background: var(--target-filled-bg);
  border-color: var(--target-filled-border);
}

.slot {
  padding: 0.15rem 0;
}

@media (max-width: 800px) {
  .segment-workspace {
    grid-template-columns: 1fr;
    grid-template-rows: none;
    row-gap: 0.45rem;
  }

  .source-col,
  .target-col {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    min-width: 0;
  }

  .source-header,
  .source-pane,
  .target-header,
  .target-pane,
  .rail-gutter {
    grid-column: auto;
    grid-row: auto;
  }

  .source-col {
    order: 1;
  }

  .rail-gutter {
    order: 2;
    width: auto;
    align-self: stretch;
  }

  .target-col {
    order: 3;
  }
}
</style>
