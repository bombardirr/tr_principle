<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { TmMatch } from '@/types/tm'
import IconButton from './IconButton.vue'
import EditorGlyph from './EditorGlyph.vue'

const props = defineProps<{
  matches: TmMatch[]
}>()

const emit = defineEmits<{
  pick: [match: TmMatch]
}>()

const { t } = useI18n()
const open = ref(false)
const expandedId = ref<string | null>(null)

const bestPct = computed(() => {
  if (!props.matches.length) return 0
  return Math.round(Math.max(...props.matches.map((m) => m.score)) * 100)
})

const label = computed(() => `${props.matches.length} · ${bestPct.value}%`)

function toggle() {
  open.value = !open.value
}

function pick(match: TmMatch) {
  emit('pick', match)
  open.value = false
}

function toggleContext(id: string | undefined) {
  if (!id) return
  expandedId.value = expandedId.value === id ? null : id
}
</script>

<template>
  <div v-if="matches.length" class="tm-picker">
    <button type="button" class="tm-badge" :title="t('editor.tmVariantsHint')" @click.stop="toggle">
      {{ label }}
    </button>
    <div v-if="open" class="tm-panel" role="listbox">
      <button
        v-for="(m, i) in matches"
        :key="m.unitId ?? `${m.target}-${i}`"
        type="button"
        class="tm-row"
        role="option"
        @click="pick(m)"
      >
        <span class="tm-pct">{{ Math.round(m.score * 100) }}%</span>
        <span class="tm-body">
          <span class="tm-target">{{ m.target }}</span>
          <span class="tm-meta">
            {{ m.updatedBy || m.createdBy || 'local' }}
            <template v-if="m.updatedAt"> · {{ m.updatedAt.slice(0, 10) }}</template>
          </span>
          <button
            v-if="m.contextBefore || m.contextAfter"
            type="button"
            class="tm-ctx-toggle"
            @click.stop="toggleContext(m.unitId ?? String(i))"
          >
            {{ t('editor.tmContext') }}
          </button>
          <span
            v-if="expandedId === (m.unitId ?? String(i))"
            class="tm-ctx"
          >
            <span v-if="m.contextBefore">… {{ m.contextBefore }}</span>
            <strong> {{ m.target }} </strong>
            <span v-if="m.contextAfter">{{ m.contextAfter }} …</span>
          </span>
        </span>
      </button>
      <IconButton class="tm-close" :title="t('editor.tmOverwriteCancel')" @click="open = false">
        <EditorGlyph name="close" />
      </IconButton>
    </div>
  </div>
</template>

<style scoped lang="scss">
.tm-picker {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  height: 1.5rem;
}

.tm-badge {
  border: 0;
  background: transparent;
  color: var(--tm-accent);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
  padding: 0;
  cursor: pointer;
  line-height: 1.5rem;
  height: 1.5rem;
  white-space: nowrap;
}

.tm-panel {
  position: absolute;
  z-index: 20;
  top: calc(100% + 0.25rem);
  left: 0;
  min-width: 16rem;
  max-width: min(28rem, 70vw);
  max-height: 16rem;
  overflow: auto;
  padding: 0.35rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
}

.tm-row {
  display: flex;
  gap: 0.5rem;
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  color: var(--text);
  padding: 0.4rem 0.45rem;
  border-radius: 6px;
  cursor: pointer;
}

.tm-row:hover {
  background: var(--surface-2);
}

.tm-pct {
  flex: 0 0 auto;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--tm-accent);
  font-variant-numeric: tabular-nums;
}

.tm-body {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.tm-target {
  font-size: 0.88rem;
  line-height: 1.35;
}

.tm-meta {
  font-size: 0.68rem;
  color: var(--text-muted);
}

.tm-ctx-toggle {
  align-self: flex-start;
  border: 0;
  background: transparent;
  color: var(--accent);
  font-size: 0.68rem;
  padding: 0;
  cursor: pointer;
}

.tm-ctx {
  font-size: 0.72rem;
  color: var(--text-muted);
  line-height: 1.35;
}

.tm-close {
  position: absolute;
  top: 0.25rem;
  right: 0.25rem;
}
</style>
