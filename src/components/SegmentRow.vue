<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Segment } from '@/types/project'
import TaggedEditor from './TaggedEditor.vue'

const props = defineProps<{
  segment: Segment
  active?: boolean
}>()

const emit = defineEmits<{
  updateTarget: [value: string]
  copySource: []
  clearTarget: []
  activate: []
}>()

const { t, locale } = useI18n()
const targetEditor = ref<{ focus: () => void; sync: () => void } | null>(null)

const labels = computed(() => {
  const out: string[] = []
  if (props.segment.inTable) out.push(t('editor.labelTable'))
  if (props.segment.storyKey.startsWith('header:')) out.push(t('editor.labelHeader'))
  if (props.segment.storyKey.startsWith('footer:')) out.push(t('editor.labelFooter'))
  return out
})

const filled = computed(() => props.segment.target.trim() !== '')

const translationLabel = computed(() =>
  filled.value ? t('status.hasTranslation') : t('status.empty'),
)

function onCopyClick() {
  emit('copySource')
  nextTick(() => {
    targetEditor.value?.sync()
    targetEditor.value?.focus()
  })
}

function onClearClick() {
  emit('clearTarget')
  nextTick(() => {
    targetEditor.value?.sync()
    targetEditor.value?.focus()
  })
}

function onTargetActivate() {
  emit('activate')
}
</script>

<template>
  <article class="row" :class="{ active }">
    <div class="meta">
      <span class="id">{{ segment.id }}</span>
      <span v-for="l in labels" :key="l" class="badge">{{ l }}</span>
      <span class="status translation" :class="filled ? 'has' : 'none'">{{ translationLabel }}</span>
      <div class="meta-actions">
        <button type="button" class="action-btn" :title="t('editor.copySourceHint')" @click="onCopyClick">
          {{ t('editor.copySource') }}
        </button>
        <button type="button" class="action-btn" :title="t('editor.clearTargetHint')" @click="onClearClick">
          {{ t('editor.clearTarget') }}
        </button>
      </div>
    </div>
    <div class="cols">
      <div class="col">
        <div class="col-title">{{ t('editor.source') }}</div>
        <div class="pane">
          <TaggedEditor
            :model-value="segment.source"
            :spans="segment.spans"
            :locale="locale"
            :editable="false"
          />
        </div>
      </div>
      <div class="col">
        <div class="col-title">{{ t('editor.target') }}</div>
        <div
          class="pane target-pane"
          :class="{ filled }"
          @mousedown.self="onTargetActivate"
          @focusin="onTargetActivate"
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
    </div>
  </article>
</template>

<style scoped lang="scss">
.row {
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0.85rem 1rem 1rem;
  margin-bottom: 0.75rem;
}

.row.active {
  box-shadow: 0 0 0 2px rgba(91, 159, 212, 0.35);
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
  margin-bottom: 0.55rem;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.status.translation.has {
  color: var(--ok);
}

.status.translation.none {
  color: var(--text-muted);
}

.badge {
  background: var(--badge-bg);
  color: var(--badge-text);
  border-radius: 999px;
  padding: 0.1rem 0.5rem;
}

.meta-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-left: auto;
}

.action-btn {
  border: 1px solid var(--border-strong);
  background: var(--surface);
  color: var(--text);
  border-radius: 6px;
  padding: 0.2rem 0.55rem;
  font-size: 0.75rem;
  cursor: pointer;
}

.action-btn:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.85rem;
  align-items: stretch;
}

.col {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.col-title {
  flex: 0 0 auto;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-faint);
  margin-bottom: 0.35rem;
}

.pane {
  flex: 1 1 auto;
  width: 100%;
  box-sizing: border-box;
  background: var(--surface-2);
  border: 1px solid var(--border-strong);
  border-radius: 8px;
  padding: 0.7rem 0.8rem;
  line-height: 1.5;
  font-size: 0.95rem;
  color: var(--text);
  min-height: 6rem;
  display: flex;
  flex-direction: column;
}

.target-pane {
  cursor: text;
}

.target-pane.filled {
  background: var(--target-filled-bg);
  border-color: var(--target-filled-border);
}

.target-pane:focus-within {
  border-color: var(--accent);
}

.target-pane.filled:focus-within {
  border-color: var(--ok);
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
  .cols {
    grid-template-columns: 1fr;
  }

  .meta-actions {
    margin-left: 0;
    width: 100%;
  }
}
</style>
