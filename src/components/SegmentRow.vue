<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TmMatch } from '@/types/tm'
import type { Segment } from '@/types/project'
import IconButton from './IconButton.vue'
import EditorGlyph from './EditorGlyph.vue'
import TaggedEditor from './TaggedEditor.vue'
import { isSegmentTranslated } from '@/utils/segmentStatus'
import { resolveSegmentKinds, type SegmentKind } from '@/utils/segmentKind'

const props = defineProps<{
  segment: Segment
  active?: boolean
  tmMatch?: TmMatch | null
}>()

const emit = defineEmits<{
  updateTarget: [value: string]
  copySource: []
  leaveEmpty: []
  resetTarget: []
  activate: []
  applyTm: []
}>()

const { t, locale } = useI18n()
const targetEditor = ref<{ focus: () => void; sync: () => void; blur: () => void } | null>(null)

const kinds = computed(() => resolveSegmentKinds(props.segment))

const filled = computed(() => isSegmentTranslated(props.segment))

const displayId = computed(() => props.segment.id.replace(/^seg-/, ''))

function onTargetFocusIn() {
  emit('activate')
}

function kindClass(kind: SegmentKind) {
  return `seg-kind--${kind}`
}

function onCopyClick() {
  emit('copySource')
  nextTick(() => {
    targetEditor.value?.sync()
    targetEditor.value?.focus()
  })
}

function onLeaveEmptyClick() {
  emit('leaveEmpty')
  nextTick(() => {
    targetEditor.value?.sync()
    targetEditor.value?.blur()
  })
}

function onResetClick() {
  emit('resetTarget')
  nextTick(() => {
    targetEditor.value?.sync()
    targetEditor.value?.blur()
  })
}

const tmEnabled = computed(() => !!props.tmMatch && !filled.value)

const tmTitle = computed(() => {
  if (!props.tmMatch || filled.value) return t('editor.tmUnavailable')
  const pct = Math.round(props.tmMatch.score * 100)
  return props.tmMatch.kind === 'exact'
    ? t('editor.tmApplyExact')
    : t('editor.tmApplyFuzzy', { pct })
})

function onApplyTmClick() {
  emit('applyTm')
  nextTick(() => {
    targetEditor.value?.sync()
    targetEditor.value?.focus()
  })
}
</script>

<template>
  <article :id="`segment-${segment.id}`" class="row" :class="{ active }">
    <div class="meta">
      <span class="seg-id">{{ displayId }}</span>
      <template v-if="kinds.length">
        <span class="meta-sep" aria-hidden="true">·</span>
        <span
          v-for="kind in kinds"
          :key="kind"
          class="seg-kind"
          :class="kindClass(kind)"
        >
          {{ t(`editor.kind.${kind}`) }}
        </span>
      </template>
    </div>

    <div class="segment-workspace">
      <div class="pane source-pane" :class="{ filled }">
        <TaggedEditor
          :model-value="segment.source"
          :spans="segment.spans"
          :locale="locale"
          :editable="false"
        />
      </div>

      <div class="mid-toolbar" role="toolbar" :aria-label="displayId">
        <IconButton
          :title="t('editor.copySourceHint')"
          @mousedown.prevent
          @click="onCopyClick"
        >
          <EditorGlyph name="copy" />
        </IconButton>
        <IconButton
          class="tm-btn"
          :title="tmTitle"
          :disabled="!tmEnabled"
          @mousedown.prevent
          @click="onApplyTmClick"
        >
          <EditorGlyph name="tm" />
        </IconButton>
        <IconButton
          :title="t('editor.leaveEmptyHint')"
          :active="filled"
          @mousedown.prevent
          @click="onLeaveEmptyClick"
        >
          <EditorGlyph name="leave-empty" />
        </IconButton>
        <IconButton
          :title="t('editor.resetTargetHint')"
          @mousedown.prevent
          @click="onResetClick"
        >
          <EditorGlyph name="reset" />
        </IconButton>
      </div>

      <div
        class="pane target-pane"
        :class="{ filled }"
        @mousedown.self="emit('activate')"
        @focusin="onTargetFocusIn"
      >
        <TaggedEditor
          ref="targetEditor"
          :model-value="segment.target"
          :spans="segment.spans"
          :locale="locale"
          :placeholder="t('editor.placeholder')"
          @update:model-value="emit('updateTarget', $event)"
        />
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
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem;
  margin-bottom: 0.45rem;
  font-size: 0.8rem;
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

.mid-toolbar :deep(.tm-btn:not(:disabled)) {
  color: var(--tm-accent);
}

.pane {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  border-radius: 8px;
  padding: 0.7rem 0.8rem;
  line-height: 1.5;
  font-size: 0.95rem;
  color: var(--text);
  min-height: 6rem;
  display: flex;
  flex-direction: column;
}

.source-pane {
  background: var(--surface-2);
}

.target-pane {
  cursor: text;
  background: var(--surface-2);
}

.pane.filled {
  background: var(--target-filled-bg);
}

.pane :deep(.tagged-wrap) {
  flex: 1 1 auto;
  min-height: 4.5rem;
}

.pane :deep(.tagged-host),
.pane :deep(.tagged-editor) {
  min-height: 4.5rem;
  height: auto;
}

@media (max-width: 800px) {
  .meta {
    margin-bottom: 0.35rem;
  }

  .segment-workspace {
    grid-template-columns: 1fr;
    row-gap: 0.45rem;
  }

  .mid-toolbar {
    flex-direction: row;
    width: auto;
    justify-content: center;
    padding: 0.15rem 0;
  }

  .segment-workspace .source-pane {
    order: 1;
  }

  .segment-workspace .mid-toolbar {
    order: 2;
  }

  .segment-workspace .target-pane {
    order: 3;
  }
}
</style>
