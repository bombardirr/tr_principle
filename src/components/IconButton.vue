<script setup lang="ts">
import AppTooltip from '@/components/AppTooltip.vue'
import { useAnchoredTooltip } from '@/composables/useAnchoredTooltip'

const props = defineProps<{
  title: string
  disabled?: boolean
  active?: boolean
  primary?: boolean
  danger?: boolean
  ghost?: boolean
  wide?: boolean
  /** Red notification dot (e.g. new shared-work member). */
  badge?: boolean
}>()

defineEmits<{
  click: []
}>()

const { tip, tooltipRef, showAtAnchor, hide } = useAnchoredTooltip()

function onShowTip(event: MouseEvent | FocusEvent) {
  void showAtAnchor(event.currentTarget as HTMLElement, props.title)
}
</script>

<template>
  <button
    type="button"
    class="icon-btn"
    :class="{ active, primary, danger, ghost, wide, 'has-badge': badge }"
    :aria-label="title"
    :aria-pressed="active ? true : undefined"
    :disabled="disabled"
    @mouseenter="onShowTip"
    @mouseleave="hide"
    @focus="onShowTip"
    @blur="hide"
    @click="$emit('click')"
  >
    <slot />
    <span v-if="badge" class="icon-btn__badge" aria-hidden="true" />
    <AppTooltip
      ref="tooltipRef"
      :text="tip.text"
      :visible="tip.visible"
      :ready="tip.ready"
      :x="tip.x"
      :y="tip.y"
      :placement="tip.placement"
    />
  </button>
</template>

<style scoped lang="scss">
.icon-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  flex: 0 0 auto;
  transition: color 0.15s ease;
}

.icon-btn__badge {
  position: absolute;
  top: 0.18rem;
  right: 0.18rem;
  width: 0.42rem;
  height: 0.42rem;
  border-radius: 50%;
  background: #e05555;
  box-shadow: 0 0 0 2px var(--surface, var(--bg));
  pointer-events: none;
}

.icon-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.icon-btn:not(:disabled):hover {
  color: var(--accent);
}

.icon-btn:not(:disabled):active {
  color: var(--accent-strong);
}

.icon-btn.active {
  color: var(--accent);
}

.icon-btn.primary {
  color: var(--accent-strong);
}

.icon-btn.primary:not(:disabled):hover {
  color: var(--accent);
}

.icon-btn.primary:not(:disabled):active {
  color: var(--accent-strong);
}

.icon-btn.danger {
  color: var(--danger);
}

.icon-btn.danger:not(:disabled):hover,
.icon-btn.danger:not(:disabled):active {
  color: var(--danger);
}

.icon-btn.ghost {
  background: transparent;
}

.icon-btn.wide {
  width: auto;
  min-width: 2rem;
  padding: 0 0.42rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.icon-btn :deep(svg) {
  width: 1rem;
  height: 1rem;
  display: block;
}
</style>
