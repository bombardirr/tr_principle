<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/auth/session'
import type { TmMatch, TmMatchKind } from '@/types/tm'
import { presentActor } from '@/utils/actorLabel'
import { formatCompactDate } from '@/utils/formatDate'

const props = defineProps<{
  matches: TmMatch[]
  /** Current segment target — badge dims when it already matches a TM option. */
  currentTarget?: string
}>()

const emit = defineEmits<{
  pick: [match: TmMatch]
}>()

const { t, locale } = useI18n()
const { user } = useAuth()
const open = ref(false)
const expandedId = ref<string | null>(null)
const root = ref<HTMLElement | null>(null)

const bestPct = computed(() => {
  if (!props.matches.length) return 0
  return Math.round(Math.max(...props.matches.map((m) => m.score)) * 100)
})

const label = computed(() => `${props.matches.length} · ${bestPct.value}%`)

/** Translation already equals one of the listed TM variants. */
const alreadyApplied = computed(() => {
  const target = props.currentTarget?.trim() ?? ''
  if (!target) return false
  return props.matches.some((m) => m.target.trim() === target)
})

function kindLabel(kind: TmMatchKind): string {
  switch (kind) {
    case 'context':
      return t('editor.tmKindContext')
    case 'exact':
      return t('editor.tmKindExact')
    case 'fragment':
      return t('editor.tmKindFragment')
    default:
      return t('editor.tmKindFuzzy')
  }
}

function authorView(match: TmMatch) {
  return presentActor(match.updatedBy || match.createdBy, user.value, t)
}

function toggle() {
  open.value = !open.value
  if (!open.value) expandedId.value = null
}

function pick(match: TmMatch) {
  emit('pick', match)
  open.value = false
  expandedId.value = null
}

function toggleContext(id: string | undefined) {
  if (!id) return
  expandedId.value = expandedId.value === id ? null : id
}

function onDocPointerDown(ev: PointerEvent) {
  if (!open.value) return
  const el = root.value
  if (!el) return
  if (ev.target instanceof Node && el.contains(ev.target)) return
  open.value = false
  expandedId.value = null
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown, true)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true)
})
</script>

<template>
  <div v-show="matches.length" ref="root" class="tm-picker">
    <button
      type="button"
      class="tm-badge"
      :class="{ 'is-applied': alreadyApplied }"
      :title="t('editor.tmVariantsHint')"
      @click.stop="toggle"
    >
      {{ label }}
    </button>
    <div v-show="open" class="tm-panel" role="listbox">
      <button
        v-for="(m, i) in matches"
        :key="m.unitId ?? `${m.target}-${i}`"
        type="button"
        class="tm-row"
        role="option"
        @click="pick(m)"
      >
        <span class="tm-head">
          <span v-if="m.kind === 'context'" class="tm-pct tm-formula">{{
            t('editor.tmKindContextFormula')
          }}</span>
          <template v-else>
            <span class="tm-pct">{{ Math.round(m.score * 100) }}%</span>
            <span class="tm-kind" :data-kind="m.kind">{{ kindLabel(m.kind) }}</span>
          </template>
          <button
            v-if="m.contextBefore || m.contextAfter"
            type="button"
            class="tm-ctx-toggle"
            :title="t('editor.tmNeighborsHint')"
            @click.stop="toggleContext(m.unitId ?? String(i))"
          >
            {{ t('editor.tmNeighbors') }}
          </button>
        </span>
        <span class="tm-target">{{ m.target }}</span>
        <span class="tm-meta">
          <span class="tm-actor" :style="authorView(m).color ? { color: authorView(m).color } : undefined">{{
            authorView(m).text
          }}</span>
          <template v-if="m.updatedAt"> · {{ formatCompactDate(m.updatedAt, locale) }}</template>
        </span>
        <span
          v-if="expandedId === (m.unitId ?? String(i))"
          class="tm-ctx"
          @click.stop
        >
          <span v-if="m.contextBefore">… {{ m.contextBefore }}</span>
          <strong> {{ m.target }} </strong>
          <span v-if="m.contextAfter">{{ m.contextAfter }} …</span>
        </span>
      </button>
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
  transition: color 0.15s ease;
}

.tm-badge.is-applied {
  color: var(--tm-accent-muted);
  font-weight: 500;
}

.tm-panel {
  position: absolute;
  z-index: 20;
  top: calc(100% + 0.2rem);
  left: 0;
  min-width: 14rem;
  max-width: min(22rem, 70vw);
  max-height: 14rem;
  overflow: auto;
  padding: 0.15rem;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--surface);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
}

.tm-row {
  display: flex;
  flex-direction: column;
  gap: 0.08rem;
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  color: var(--text);
  padding: 0.28rem 0.4rem;
  border-radius: 4px;
  cursor: pointer;
}

.tm-row:hover {
  background: var(--surface-2);
}

.tm-head {
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
  min-width: 0;
}

.tm-pct {
  flex: 0 0 auto;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--tm-accent);
  font-variant-numeric: tabular-nums;
}

.tm-formula {
  letter-spacing: 0.01em;
}

.tm-kind {
  font-size: 0.62rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: lowercase;
}

.tm-kind[data-kind='context'],
.tm-kind[data-kind='exact'] {
  color: var(--tm-accent);
}

.tm-ctx-toggle {
  margin-left: auto;
  border: 0;
  background: transparent;
  color: var(--accent);
  font-size: 0.62rem;
  padding: 0;
  cursor: pointer;
  line-height: 1;
}

.tm-target {
  font-size: 0.82rem;
  line-height: 1.3;
}

.tm-meta {
  font-size: 0.62rem;
  color: var(--text-muted);
  line-height: 1.25;
}

.tm-actor {
  font-weight: 600;
}

.tm-ctx {
  font-size: 0.66rem;
  color: var(--text-muted);
  line-height: 1.3;
  padding-top: 0.1rem;
}
</style>
