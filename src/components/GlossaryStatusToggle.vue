<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { GlossaryTermStatus } from '@/types/glossary'
import AppTooltip from '@/components/AppTooltip.vue'
import { useAnchoredTooltip } from '@/composables/useAnchoredTooltip'

const props = defineProps<{
  modelValue: GlossaryTermStatus
  disabled?: boolean
  compact?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: GlossaryTermStatus]
}>()

const { t } = useI18n()
const { tip, tooltipRef, showAtAnchor, hide } = useAnchoredTooltip()

const banned = computed(() => props.modelValue === 'forbidden')

function setStatus(next: GlossaryTermStatus) {
  if (props.disabled || next === props.modelValue) return
  emit('update:modelValue', next)
}

function flip() {
  if (props.disabled) return
  emit('update:modelValue', banned.value ? 'approved' : 'forbidden')
}

function showTip(event: MouseEvent | FocusEvent, text: string) {
  if (props.disabled || !text) return
  void showAtAnchor(event.currentTarget as HTMLElement, text)
}
</script>

<template>
  <div
    class="status-toggle"
    :class="{ banned, compact, disabled }"
    role="group"
    :aria-label="t('glossary.status')"
  >
    <button
      type="button"
      class="side ok"
      :aria-pressed="!banned"
      :disabled="disabled"
      @mouseenter="showTip($event, t('glossary.statusApproved'))"
      @mouseleave="hide"
      @focus="showTip($event, t('glossary.statusApproved'))"
      @blur="hide"
      @click.stop="setStatus('approved')"
    >
      {{ t('glossary.statusApprovedShort') }}
    </button>
    <button
      type="button"
      class="track"
      :disabled="disabled"
      :aria-label="t('glossary.statusToggleHint')"
      @mouseenter="showTip($event, t('glossary.statusToggleHint'))"
      @mouseleave="hide"
      @focus="showTip($event, t('glossary.statusToggleHint'))"
      @blur="hide"
      @click.stop="flip"
    >
      <span class="thumb" aria-hidden="true" />
    </button>
    <button
      type="button"
      class="side ban"
      :aria-pressed="banned"
      :disabled="disabled"
      @mouseenter="showTip($event, t('glossary.statusForbidden'))"
      @mouseleave="hide"
      @focus="showTip($event, t('glossary.statusForbidden'))"
      @blur="hide"
      @click.stop="setStatus('forbidden')"
    >
      {{ t('glossary.statusForbiddenShort') }}
    </button>
    <AppTooltip
      ref="tooltipRef"
      :text="tip.text"
      :visible="tip.visible"
      :ready="tip.ready"
      :x="tip.x"
      :y="tip.y"
      :placement="tip.placement"
    />
  </div>
</template>

<style scoped lang="scss">
/* Split-rail status: OK · rail · BAN — not a stock iOS switch */
.status-toggle {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  user-select: none;
}
.status-toggle.disabled {
  opacity: 0.45;
  pointer-events: none;
}
.side {
  border: 0;
  background: transparent;
  padding: 0;
  margin: 0;
  font: inherit;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  cursor: pointer;
  color: var(--text-faint);
  transition: color 0.15s ease;
}
.side.ok[aria-pressed='true'] {
  color: var(--ok);
}
.side.ban[aria-pressed='true'] {
  color: var(--danger);
}
.track {
  position: relative;
  width: 1.7rem;
  height: 0.72rem;
  padding: 0;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  background: color-mix(in srgb, var(--ok) 28%, var(--surface-2));
  transition: background 0.18s ease;
}
.status-toggle.banned .track {
  background: color-mix(in srgb, var(--danger) 32%, var(--surface-2));
}
.thumb {
  position: absolute;
  top: 0.1rem;
  left: 0.12rem;
  width: 0.52rem;
  height: 0.52rem;
  border-radius: 2px;
  background: var(--ok);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  transition:
    left 0.18s cubic-bezier(0.2, 0.85, 0.3, 1.1),
    background 0.18s ease,
    border-radius 0.18s ease;
}
.status-toggle.banned .thumb {
  left: calc(100% - 0.64rem);
  background: var(--danger);
  border-radius: 50%;
}
.compact .side {
  font-size: 0.62rem;
}
.compact .track {
  width: 1.45rem;
  height: 0.62rem;
}
.compact .thumb {
  width: 0.42rem;
  height: 0.42rem;
  top: 0.1rem;
  left: 0.1rem;
}
.compact.banned .thumb {
  left: calc(100% - 0.52rem);
}
</style>
