<script setup lang="ts">
import { ref } from 'vue'
import type { TooltipPlacement } from '@/utils/tooltipPlacement'

defineProps<{
  text: string
  visible: boolean
  ready?: boolean
  x: number
  y: number
  placement: TooltipPlacement
}>()

const root = ref<HTMLElement | null>(null)
defineExpose({ root })
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="root"
      class="app-tooltip"
      :class="{ 'app-tooltip--ready': ready }"
      :data-placement="placement"
      :style="{ left: `${x}px`, top: `${y}px` }"
      role="tooltip"
    >
      {{ text }}
    </div>
  </Teleport>
</template>

<style scoped>
.app-tooltip {
  position: fixed;
  z-index: 10000;
  --tip-gap: 6px;
  padding: 0.35rem 0.6rem;
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font-size: 0.78rem;
  line-height: 1.35;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  pointer-events: none;
  white-space: nowrap;
}

.app-tooltip:not(.app-tooltip--ready) {
  opacity: 0;
  visibility: hidden;
}

.app-tooltip[data-placement='top'] {
  transform: translate(-50%, calc(-100% - var(--tip-gap)));
}

.app-tooltip[data-placement='bottom'] {
  transform: translate(-50%, var(--tip-gap));
}

.app-tooltip[data-placement='left'] {
  transform: translate(calc(-100% - var(--tip-gap)), -50%);
}

.app-tooltip[data-placement='right'] {
  transform: translate(var(--tip-gap), -50%);
}
</style>
