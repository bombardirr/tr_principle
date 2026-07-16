<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
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
  commitTm: []
}>()

const { t, locale } = useI18n()
const targetEditor = ref<{ focus: () => void; sync: () => void; blur: () => void } | null>(null)
const tmOverwritePending = ref(false)

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

const hasTm = computed(() => !!props.tmMatch)

const tmMatchesTarget = computed(() => {
  if (!props.tmMatch) return false
  return props.segment.target.trim() === props.tmMatch.target.trim()
})

const tmShowStrike = computed(() => hasTm.value && filled.value)

const tmCanApply = computed(() => hasTm.value && !filled.value)

const tmCanOverwrite = computed(() => hasTm.value && filled.value)

const tmCommitPending = computed(() => !!props.segment.tmSavePending && filled.value)

const tmTitle = computed(() => {
  if (tmCommitPending.value) return t('editor.tmCommitHint')
  if (!props.tmMatch) return t('editor.tmUnavailable')
  if (tmOverwritePending.value) return t('editor.tmOverwritePrompt')
  if (filled.value) {
    if (tmMatchesTarget.value) return t('editor.tmReapplyHint')
    return t('editor.tmOverwriteHint')
  }
  const pct = Math.round(props.tmMatch.score * 100)
  if (props.tmMatch.kind === 'context') return t('editor.tmApplyContext')
  if (props.tmMatch.kind === 'exact') return t('editor.tmApplyExact')
  if (props.tmMatch.kind === 'fragment') {
    return props.tmMatch.score >= 1
      ? t('editor.tmApplyFragmentExact')
      : t('editor.tmApplyFragment', { pct })
  }
  return t('editor.tmApplyFuzzy', { pct })
})

watch(
  () => [props.segment.id, props.segment.target] as const,
  () => {
    tmOverwritePending.value = false
  },
)

function syncTargetEditor() {
  nextTick(() => {
    targetEditor.value?.sync()
    targetEditor.value?.focus()
  })
}

function onApplyTmClick() {
  if (!props.tmMatch || !tmCanApply.value) return
  emit('applyTm')
  syncTargetEditor()
}

function requestTmOverwrite() {
  if (!tmCanOverwrite.value) return
  tmOverwritePending.value = true
}

function confirmTmOverwrite() {
  if (!props.tmMatch) return
  tmOverwritePending.value = false
  emit('applyTm')
  syncTargetEditor()
}

function cancelTmOverwrite() {
  tmOverwritePending.value = false
}

function onCommitTmClick() {
  emit('commitTm')
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
        <div class="tm-slot">
          <div v-if="tmOverwritePending" class="tm-confirm" role="group" :aria-label="tmTitle">
            <IconButton
              class="tm-confirm-yes"
              :title="t('editor.tmOverwriteConfirm')"
              @mousedown.prevent
              @click="confirmTmOverwrite"
            >
              <EditorGlyph name="check" />
            </IconButton>
            <IconButton
              :title="t('editor.tmOverwriteCancel')"
              @mousedown.prevent
              @click="cancelTmOverwrite"
            >
              <EditorGlyph name="close" />
            </IconButton>
          </div>
          <IconButton
            v-else
            class="tm-btn"
            :class="{
              'tm-btn--strike': tmShowStrike && !tmCommitPending,
              'tm-btn--commit': tmCommitPending,
            }"
            :title="tmTitle"
            :disabled="!hasTm && !tmCommitPending"
            @mousedown.prevent
            @click="
              tmCommitPending
                ? onCommitTmClick()
                : tmCanApply
                  ? onApplyTmClick()
                  : requestTmOverwrite()
            "
          >
            <EditorGlyph
              :name="
                tmCommitPending ? 'tm-commit' : tmShowStrike ? 'tm-strike' : 'tm'
              "
            />
          </IconButton>
        </div>
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
$row-grid: minmax(0, 1fr) auto minmax(0, 1fr);
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
  overflow: visible;
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

.mid-toolbar :deep(.tm-btn.tm-btn--strike:disabled) {
  color: var(--text-muted);
  opacity: 0.45;
}

.mid-toolbar :deep(.tm-btn.tm-btn--commit) {
  color: var(--ok);
}

.tm-slot {
  position: relative;
  flex: 0 0 $toolbar-icon-size;
  width: $toolbar-icon-size;
  height: $toolbar-icon-size;
}

.tm-confirm {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 2;
  display: inline-flex;
  flex-direction: row;
  align-items: center;
  gap: 0.05rem;
  transform: translate(-50%, -50%);
  pointer-events: auto;
}

.tm-confirm :deep(.icon-btn) {
  width: 1.32rem;
  height: 1.32rem;
  border-radius: 5px;
}

.tm-confirm :deep(.tm-confirm-yes) {
  color: var(--warn);
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
