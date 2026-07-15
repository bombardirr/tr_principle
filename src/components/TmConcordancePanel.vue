<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/auth/session'
import { presentActor } from '@/utils/actorLabel'
import { formatCompactDate } from '@/utils/formatDate'
import {
  CONCORDANCE_MIN_QUERY,
  searchConcordance,
  type ConcordanceHit,
} from '@/tm/concordance'
import type { TmUnit } from '@/types/tm'
import IconButton from './IconButton.vue'
import EditorGlyph from './EditorGlyph.vue'

const props = defineProps<{
  units: TmUnit[]
  /** Optional seed when opening (e.g. active segment source). */
  seedQuery?: string
  /** False when no segment is active — insert target is undefined. */
  enabled?: boolean
}>()

const emit = defineEmits<{
  insert: [target: string]
  openChange: [open: boolean]
}>()

const { t, locale } = useI18n()
const { user } = useAuth()
const open = ref(false)
const query = ref('')
const root = ref<HTMLElement | null>(null)

const canUse = computed(() => props.enabled !== false)

const buttonTitle = computed(() =>
  canUse.value ? t('editor.concordanceHint') : t('editor.concordanceNeedSegment'),
)

const hits = computed(() => searchConcordance(props.units, query.value))

const status = computed(() => {
  const q = query.value.trim()
  if (q.length > 0 && q.length < CONCORDANCE_MIN_QUERY) {
    return t('editor.concordanceMinChars', { n: CONCORDANCE_MIN_QUERY })
  }
  if (q.length >= CONCORDANCE_MIN_QUERY && !hits.value.length) {
    return t('editor.concordanceEmpty')
  }
  return ''
})

const hasScrimHost = ref(false)

function authorView(hit: ConcordanceHit) {
  return presentActor(hit.updatedBy || hit.createdBy, user.value, t)
}

function setOpen(next: boolean) {
  if (open.value === next) return
  open.value = next
  emit('openChange', next)
}

function toggle() {
  if (!canUse.value) return
  const next = !open.value
  setOpen(next)
  if (next) {
    const seed = props.seedQuery?.trim()
    if (seed && !query.value.trim()) query.value = seed.slice(0, 80)
  }
}

function close() {
  setOpen(false)
}

watch(canUse, (ok) => {
  if (!ok) close()
})

function pick(hit: ConcordanceHit) {
  emit('insert', hit.target)
  close()
}

async function copyTarget(hit: ConcordanceHit) {
  try {
    await navigator.clipboard.writeText(hit.target)
  } catch {
    /* clipboard may be denied — silent */
  }
}

function onDocPointerDown(ev: PointerEvent) {
  if (!open.value) return
  const el = root.value
  if (!el) return
  if (ev.target instanceof Node && el.contains(ev.target)) return
  // Scrim / outside click — ignore if inside teleported scrim handled separately
  const scrim = document.getElementById('editor-concordance-scrim')
  if (scrim && ev.target instanceof Node && scrim.contains(ev.target)) {
    close()
    return
  }
  if (hasScrimHost.value) return
  close()
}

function onWheelCapture(ev: WheelEvent) {
  if (!open.value) return
  const el = root.value
  if (el && ev.target instanceof Node && el.contains(ev.target)) return
  ev.preventDefault()
}

onMounted(() => {
  hasScrimHost.value = !!document.getElementById('editor-concordance-root')
  document.addEventListener('pointerdown', onDocPointerDown, true)
  document.addEventListener('wheel', onWheelCapture, { capture: true, passive: false })
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true)
  document.removeEventListener('wheel', onWheelCapture, true)
  if (open.value) emit('openChange', false)
})
</script>

<template>
  <div ref="root" class="conc" :class="{ 'is-open': open }">
    <IconButton
      :title="buttonTitle"
      :active="open"
      :disabled="!canUse"
      @mousedown.prevent
      @click="toggle"
    >
      <EditorGlyph name="concordance" />
    </IconButton>
    <div
      v-show="open"
      class="conc-panel"
      role="dialog"
      :aria-label="t('editor.concordanceTitle')"
    >
      <input
        v-model="query"
        class="conc-input"
        type="search"
        autocomplete="off"
        :placeholder="t('editor.concordancePlaceholder')"
      />
      <p v-if="status" class="conc-status">{{ status }}</p>
      <ul v-else class="conc-list">
        <li v-for="h in hits" :key="h.unitId" class="conc-item">
          <button type="button" class="conc-row" @click="pick(h)">
            <span class="conc-source">{{ h.source }}</span>
            <span class="conc-target">{{ h.target }}</span>
            <span class="conc-meta">
              <span
                class="conc-actor"
                :style="authorView(h).color ? { color: authorView(h).color } : undefined"
              >{{ authorView(h).text }}</span>
              <template v-if="h.updatedAt">
                · {{ formatCompactDate(h.updatedAt, locale) }}
              </template>
            </span>
          </button>
          <IconButton
            class="conc-copy"
            :title="t('editor.concordanceCopyHint')"
            @mousedown.prevent.stop
            @click.stop="copyTarget(h)"
          >
            <EditorGlyph name="clipboard" />
          </IconButton>
        </li>
      </ul>
    </div>

    <Teleport v-if="open && hasScrimHost" to="#editor-concordance-root">
      <div
        id="editor-concordance-scrim"
        class="conc-scrim"
        aria-hidden="true"
        @pointerdown.prevent="close"
      />
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.conc {
  position: relative;
  display: inline-flex;
}

.conc-panel {
  position: absolute;
  z-index: 30;
  top: 0;
  left: calc(100% + 0.25rem);
  width: min(20rem, 70vw);
  max-height: 18rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.35rem;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--surface);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.22);
}

.conc-input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.35rem 0.45rem;
  border-radius: 4px;
  border: 1px solid var(--border-strong);
  background: var(--bg);
  color: var(--text);
  font-size: 0.8rem;
}

.conc-status {
  margin: 0;
  padding: 0.35rem 0.25rem;
  font-size: 0.72rem;
  color: var(--text-muted);
}

.conc-list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow: auto;
  max-height: 14rem;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.conc-item {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: start;
  gap: 0.15rem;
  border-radius: 4px;
}

.conc-item:hover {
  background: var(--surface-2);
}

.conc-row {
  display: flex;
  flex-direction: column;
  gap: 0.08rem;
  min-width: 0;
  text-align: left;
  border: 0;
  background: transparent;
  color: var(--text);
  padding: 0.3rem 0.35rem;
  border-radius: 4px;
  cursor: pointer;
}

.conc-copy {
  margin-top: 0.2rem;
  margin-right: 0.15rem;
  opacity: 0.55;
}

.conc-item:hover .conc-copy {
  opacity: 1;
}

.conc-copy :deep(.icon-btn) {
  width: 1.35rem;
  height: 1.35rem;
}

.conc-source {
  font-size: 0.72rem;
  color: var(--text-muted);
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conc-target {
  font-size: 0.82rem;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.conc-meta {
  font-size: 0.62rem;
  color: var(--text-muted);
}

.conc-actor {
  font-weight: 600;
}
</style>

<style lang="scss">
/* Teleported into #editor-concordance-root (editor column only). */
.conc-scrim {
  position: absolute;
  inset: 0;
  z-index: 12;
  pointer-events: auto;
  background: rgba(0, 0, 0, 0.28);
  cursor: default;
}
</style>
