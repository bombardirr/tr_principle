<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TmMatch } from '@/types/tm'
import type { Segment } from '@/types/project'
import IconButton from './IconButton.vue'
import EditorGlyph from './EditorGlyph.vue'
import TaggedEditor from './TaggedEditor.vue'
import TmVariantPicker from './TmVariantPicker.vue'
import { isSegmentTranslated } from '@/utils/segmentStatus'
import { resolveSegmentKinds, type SegmentKind } from '@/utils/segmentKind'

const props = defineProps<{
  segments: Segment[]
  /** 1-based index shown in the editor (document order). */
  displayIndex?: number
  activeSegmentId?: string | null
  matchesFor: (seg: Segment) => TmMatch[]
  needsTmSave: (seg: Segment) => boolean
}>()

const emit = defineEmits<{
  updateTarget: [segId: string, value: string]
  copySource: [segId: string]
  leaveEmpty: [segId: string]
  resetTarget: [segId: string]
  activate: [segId: string]
  applyTm: [segId: string, match: TmMatch]
  saveToTm: [segId: string]
}>()

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
</script>

<template>
  <article
    :id="`segment-${sorted[0]?.id}`"
    class="row"
    :class="{ active: sorted.some((s) => s.id === activeSegmentId) }"
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
      <div class="meta-mid" aria-hidden="true" />
      <div class="meta-target">
        <TmVariantPicker
          v-if="activeSeg"
          :matches="matchesFor(activeSeg)"
          @pick="onPick(activeSeg, $event)"
        />
        <IconButton
          v-if="canSaveToTm(activeSeg)"
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

.meta-mid {
  width: $toolbar-col-width;
  justify-self: center;
}

.meta-target {
  flex-wrap: nowrap;
  justify-content: flex-start;
}

.tm-save-btn {
  margin-left: auto;
  flex: 0 0 auto;
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

  .meta-mid {
    display: none;
  }

  .mid-toolbar {
    flex-direction: row;
    width: auto;
    justify-content: center;
  }
}
</style>
