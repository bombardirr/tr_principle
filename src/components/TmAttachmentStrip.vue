<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import EditorGlyph from '@/components/EditorGlyph.vue'
import {
  colorForTmBase,
  PERSONAL_TM_ATTACHMENT_ID,
  TM_ATTACHMENT_CATALOG,
} from '@/tm/projectAttachments'
import type { ProjectTmAttachmentId } from '@/types/project'

export type TmStripItem = {
  id: string
  canRead: boolean
  canWrite: boolean
}

const props = withDefaults(
  defineProps<{
    items: TmStripItem[]
    showAdd?: boolean
    busy?: boolean
    /** Optional personal TM tip stats when a personal chip is hovered. */
    personalUnitCount?: number
    personalLastUpdatedAt?: string | null
  }>(),
  {
    showAdd: true,
    busy: false,
    personalUnitCount: 0,
    personalLastUpdatedAt: null,
  },
)

const emit = defineEmits<{
  add: []
}>()

const { t, locale } = useI18n()
const tipId = ref<string | null>(null)
const tipX = ref(0)
const tipY = ref(0)
const tipPlacement = ref<'top' | 'bottom'>('bottom')

const tipItem = computed(() =>
  tipId.value ? props.items.find(item => item.id === tipId.value) ?? null : null,
)

function tmColor(id: string) {
  return colorForTmBase(id as ProjectTmAttachmentId)
}

function tmGlyph(id: string) {
  return TM_ATTACHMENT_CATALOG.find(entry => entry.id === id)?.glyph || 'tm'
}

function tmLabel(id: string) {
  return id === PERSONAL_TM_ATTACHMENT_ID
    ? t('projects.tmPersonalBase')
    : (TM_ATTACHMENT_CATALOG.find(entry => entry.id === id)?.label ?? id)
}

function tmShortName(id: string) {
  const label = tmLabel(id)
  return label.length > 8 ? `${label.slice(0, 7)}…` : label
}

function formatTmDate(iso: string, short = false) {
  try {
    const d = new Date(iso)
    if (short) {
      return d.toLocaleDateString(locale.value, { day: 'numeric', month: 'short' })
    }
    return d.toLocaleString(locale.value, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function personalLastUpdatedText() {
  if (!props.personalLastUpdatedAt) return t('projects.tmLastUpdatedNever')
  const date = formatTmDate(props.personalLastUpdatedAt, false)
  return t('projects.tmLastUpdated', { date })
}

function showChipTip(event: MouseEvent, id: string) {
  const el = event.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  const spaceBelow = window.innerHeight - rect.bottom
  const preferBottom = spaceBelow >= 160 || rect.top < 96
  tipPlacement.value = preferBottom ? 'bottom' : 'top'
  tipX.value = rect.left + rect.width / 2
  tipY.value = preferBottom ? rect.bottom : rect.top
  tipId.value = id
}

function hideChipTip() {
  tipId.value = null
}
</script>

<template>
  <div class="tm-attachment-strip">
    <div class="tm-head" @click.stop>
      <div class="tm-strip">
        <div
          v-for="attachment in items"
          :key="attachment.id"
          class="tm-chip-wrap"
          :style="{ '--tm-color': tmColor(attachment.id) }"
          @mouseenter="showChipTip($event, attachment.id)"
          @mouseleave="hideChipTip"
          @focusin="showChipTip($event as MouseEvent, attachment.id)"
          @focusout="hideChipTip"
        >
          <button type="button" class="tm-chip" :aria-label="tmLabel(attachment.id)">
            <EditorGlyph class="tm-icon" :name="tmGlyph(attachment.id)" />
            <span
              class="tm-rw"
              :class="{ on: attachment.canRead }"
              :title="t('projects.tmPermRead')"
              >{{ t('projects.tmPermReadShort') }}</span
            >
            <span
              class="tm-rw"
              :class="{ on: attachment.canWrite }"
              :title="t('projects.tmPermWrite')"
              >{{ t('projects.tmPermWriteShort') }}</span
            >
            <span class="tm-name">{{ tmShortName(attachment.id) }}</span>
          </button>
        </div>
        <button
          v-if="showAdd"
          type="button"
          class="tm-chip-add"
          data-testid="tm-strip-add"
          :title="t('projects.tmOpenPicker')"
          :aria-label="t('projects.tmOpenPicker')"
          :disabled="busy"
          @click="emit('add')"
        >
          <EditorGlyph class="tm-icon" name="plus" />
        </button>
      </div>
    </div>
    <Teleport to="body">
      <div
        v-if="tipItem"
        class="tm-tip"
        :class="`tm-tip--${tipPlacement}`"
        role="tooltip"
        :style="{
          '--tm-color': tmColor(tipItem.id),
          left: `${tipX}px`,
          top: `${tipY}px`,
        }"
      >
        <div class="tm-tip-head">
          <EditorGlyph class="tm-tip-icon" :name="tmGlyph(tipItem.id)" />
          <strong>{{ tmLabel(tipItem.id) }}</strong>
        </div>
        <div class="tm-tip-row">
          <span class="tm-tip-key" :class="{ on: tipItem.canRead }">{{
            t('projects.tmPermReadShort')
          }}</span>
          <span class="tm-tip-label">{{ t('projects.tmPermRead') }}</span>
          <span class="tm-tip-state" :class="{ on: tipItem.canRead }">
            {{ tipItem.canRead ? t('projects.tmPermOn') : t('projects.tmPermOff') }}
          </span>
        </div>
        <div class="tm-tip-row">
          <span class="tm-tip-key" :class="{ on: tipItem.canWrite }">{{
            t('projects.tmPermWriteShort')
          }}</span>
          <span class="tm-tip-label">{{ t('projects.tmPermWrite') }}</span>
          <span class="tm-tip-state" :class="{ on: tipItem.canWrite }">
            {{ tipItem.canWrite ? t('projects.tmPermOn') : t('projects.tmPermOff') }}
          </span>
        </div>
        <template v-if="tipItem.id === PERSONAL_TM_ATTACHMENT_ID">
          <div class="tm-tip-meta">{{ t('projects.tmUnitsStat', { n: personalUnitCount }) }}</div>
          <div class="tm-tip-meta">{{ personalLastUpdatedText() }}</div>
        </template>
        <p class="tm-tip-hint">{{ t('projects.tmChipTipHint') }}</p>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.tm-head {
  margin-bottom: 0.2rem;
  overflow: visible;
}

.tm-strip {
  flex: 0 1 50%;
  max-width: 50%;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.15rem;
  overflow: visible;
}

.tm-chip-wrap {
  position: relative;
  flex: 0 0 auto;
}

.tm-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.22rem;
  border: 0;
  background: transparent;
  color: var(--text);
  border-radius: 6px;
  padding: 0.1rem 0.2rem;
  font: inherit;
  font-size: 0.66rem;
  line-height: 1;
  cursor: default;
}

.tm-chip:hover {
  background: color-mix(in srgb, var(--tm-color) 10%, transparent);
}

.tm-chip-add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 1.35rem;
  height: 1.35rem;
  border: 0;
  border-radius: 6px;
  padding: 0;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.tm-chip-add:hover:not(:disabled) {
  color: var(--accent);
}

.tm-chip-add:disabled {
  opacity: 0.45;
  cursor: default;
}

.tm-name {
  max-width: 4.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-muted);
  font-weight: 600;
  line-height: 1;
}

.tm-rw {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 0.9rem;
  font-weight: 700;
  line-height: 1;
  color: var(--text-muted);
  opacity: 0.38;
  filter: grayscale(0.35);
}

.tm-rw.on {
  color: var(--accent);
  opacity: 1;
  filter: none;
  text-shadow:
    0 0 6px color-mix(in srgb, var(--accent) 70%, transparent),
    0 0 12px color-mix(in srgb, var(--accent) 35%, transparent);
}

.tm-icon {
  display: block;
  width: 0.8rem;
  height: 0.8rem;
  color: var(--tm-color, var(--accent));
  flex: 0 0 auto;
}

.tm-chip-add .tm-icon {
  color: inherit;
}

.tm-tip {
  position: fixed;
  z-index: 10050;
  min-width: 11.5rem;
  padding: 0.55rem 0.65rem 0.5rem;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--tm-color) 35%, var(--border));
  background: color-mix(in srgb, var(--surface) 94%, var(--tm-color));
  box-shadow:
    0 10px 28px rgba(0, 0, 0, 0.28),
    0 0 0 1px color-mix(in srgb, var(--accent) 12%, transparent),
    0 0 18px color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--text);
  pointer-events: none;
  transform: translate(-50%, 0.4rem);
}

.tm-tip--top {
  transform: translate(-50%, calc(-100% - 0.4rem));
}

.tm-tip--bottom {
  transform: translate(-50%, 0.4rem);
}

.tm-tip-head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.45rem;

  strong {
    font-size: 0.78rem;
    font-weight: 700;
    line-height: 1.25;
  }
}

.tm-tip-icon {
  width: 0.95rem;
  height: 0.95rem;
  color: var(--tm-color);
  flex: 0 0 auto;
}

.tm-tip-row {
  display: grid;
  grid-template-columns: 1.1rem minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.22rem;
  font-size: 0.72rem;
}

.tm-tip-key {
  font-weight: 800;
  color: var(--text-muted);
  opacity: 0.4;
}

.tm-tip-key.on {
  color: var(--accent);
  opacity: 1;
  text-shadow:
    0 0 6px color-mix(in srgb, var(--accent) 65%, transparent),
    0 0 12px color-mix(in srgb, var(--accent) 30%, transparent);
}

.tm-tip-label {
  color: var(--text-muted);
}

.tm-tip-state {
  color: var(--text-muted);
  opacity: 0.55;
  font-variant-numeric: tabular-nums;
}

.tm-tip-state.on {
  color: var(--accent);
  opacity: 1;
}

.tm-tip-meta {
  margin-top: 0.28rem;
  font-size: 0.7rem;
  color: var(--text-muted);
  line-height: 1.3;
}

.tm-tip-hint {
  margin: 0.45rem 0 0;
  font-size: 0.66rem;
  color: var(--text-muted);
  line-height: 1.3;
}
</style>
