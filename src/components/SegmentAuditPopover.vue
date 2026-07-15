<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/auth/session'
import type { SegmentAuditEntry } from '@/types/project'
import { presentActor } from '@/utils/actorLabel'
import { formatCompactDateTime } from '@/utils/formatDate'
import { auditSnippet } from '@/utils/segmentAudit'
import IconButton from './IconButton.vue'
import EditorGlyph from './EditorGlyph.vue'

const props = defineProps<{
  entries: SegmentAuditEntry[]
}>()

const emit = defineEmits<{
  openChange: [open: boolean]
}>()

const { t, locale } = useI18n()
const { user } = useAuth()
const open = ref(false)
const hoverKey = ref<string | null>(null)
const root = ref<HTMLElement | null>(null)
const hasScrimHost = ref(false)

const ordered = computed(() => [...props.entries].reverse())

const hovered = computed(() => {
  if (!hoverKey.value) return null
  return ordered.value.find((e, i) => entryKey(e, i) === hoverKey.value) ?? null
})

function entryKey(entry: SegmentAuditEntry, i: number) {
  return `${entry.at}-${i}`
}

function actionLabel(entry: SegmentAuditEntry): string {
  return t(`editor.auditAction.${entry.action}`)
}

function authorView(entry: SegmentAuditEntry) {
  return presentActor(entry.by, user.value, t)
}

function textOrEmpty(value: string | undefined): string {
  const t0 = (value ?? '').trim()
  return t0 || t('editor.auditEmpty')
}

function changeLine(entry: SegmentAuditEntry): string | null {
  if (entry.before === undefined && entry.after === undefined) return null
  const a = auditSnippet(entry.before)
  const b = auditSnippet(entry.after)
  const left = a || t('editor.auditEmpty')
  const right = b || t('editor.auditEmpty')
  return `${left} → ${right}`
}

function hasDiff(entry: SegmentAuditEntry): boolean {
  return entry.before !== undefined || entry.after !== undefined
}

function setOpen(next: boolean) {
  if (open.value === next) return
  open.value = next
  if (!next) hoverKey.value = null
  emit('openChange', next)
}

function toggle() {
  if (!props.entries.length) return
  setOpen(!open.value)
}

function close() {
  setOpen(false)
}

function onRowEnter(key: string) {
  hoverKey.value = key
}

function onDocPointerDown(ev: PointerEvent) {
  if (!open.value) return
  const el = root.value
  if (!el) return
  if (ev.target instanceof Node && el.contains(ev.target)) return
  const scrim = document.getElementById('editor-audit-scrim')
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
  <div ref="root" class="audit">
    <IconButton
      :title="t('editor.auditHint')"
      :disabled="!entries.length"
      :active="open"
      @mousedown.prevent
      @click="toggle"
    >
      <EditorGlyph name="audit" />
    </IconButton>
    <div
      v-show="open && entries.length"
      class="audit-pop"
      role="dialog"
      :aria-label="t('editor.auditTitle')"
    >
      <ul class="audit-list">
        <li
          v-for="(e, i) in ordered"
          :key="entryKey(e, i)"
          class="audit-row"
          :class="{ active: hoverKey === entryKey(e, i) }"
          @mouseenter="onRowEnter(entryKey(e, i))"
        >
          <span class="audit-action">
            {{ actionLabel(e) }}
            <template v-if="e.detail"> · {{ e.detail }}</template>
          </span>
          <span v-if="changeLine(e)" class="audit-change">{{ changeLine(e) }}</span>
          <span class="audit-meta">
            <span class="audit-actor" :style="authorView(e).color ? { color: authorView(e).color } : undefined">{{
              authorView(e).text
            }}</span>
            · {{ formatCompactDateTime(e.at, locale) }}
          </span>
        </li>
      </ul>

      <aside
        v-if="hovered && hasDiff(hovered)"
        class="audit-flyout"
        aria-live="polite"
      >
        <div class="audit-detail-block">
          <span class="audit-detail-label">{{ t('editor.auditBefore') }}</span>
          <span class="audit-detail-text">{{ textOrEmpty(hovered.before) }}</span>
        </div>
        <div class="audit-detail-block">
          <span class="audit-detail-label">{{ t('editor.auditAfter') }}</span>
          <span class="audit-detail-text">{{ textOrEmpty(hovered.after) }}</span>
        </div>
      </aside>
    </div>

    <Teleport v-if="open && hasScrimHost" to="#editor-concordance-root">
      <div
        id="editor-audit-scrim"
        class="audit-scrim"
        aria-hidden="true"
        @pointerdown.prevent="close"
      />
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.audit {
  position: relative;
  display: inline-flex;
}

.audit-pop {
  position: absolute;
  z-index: 20;
  top: calc(100% + 0.2rem);
  left: 50%;
  transform: translateX(-50%);
}

.audit-list {
  list-style: none;
  margin: 0;
  padding: 0.25rem;
  width: min(15rem, 72vw);
  max-height: 16rem;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--surface);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
}

.audit-row {
  display: flex;
  flex-direction: column;
  gap: 0.05rem;
  padding: 0.28rem 0.35rem;
  border-radius: 4px;
  cursor: default;
}

.audit-row:hover,
.audit-row.active {
  background: var(--surface-2);
}

.audit-action {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text);
  line-height: 1.25;
}

.audit-change {
  font-size: 0.66rem;
  color: var(--text-muted);
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.audit-meta {
  font-size: 0.62rem;
  color: var(--text-muted);
  line-height: 1.25;
}

.audit-actor {
  font-weight: 600;
}

.audit-flyout {
  position: absolute;
  left: calc(100% + 0.25rem);
  top: 0;
  width: min(14rem, 60vw);
  max-height: 16rem;
  overflow: auto;
  padding: 0.35rem 0.4rem;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--surface);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.audit-detail-block {
  display: flex;
  flex-direction: column;
  gap: 0.05rem;
  min-width: 0;
}

.audit-detail-label {
  font-size: 0.58rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.audit-detail-text {
  font-size: 0.7rem;
  color: var(--text);
  line-height: 1.35;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>

<style lang="scss">
.audit-scrim {
  position: absolute;
  inset: 0;
  z-index: 12;
  pointer-events: auto;
  background: rgba(0, 0, 0, 0.28);
  cursor: default;
}
</style>
