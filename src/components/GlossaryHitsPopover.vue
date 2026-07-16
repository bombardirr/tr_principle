<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { GlossaryHit } from '@/types/glossary'
import GlossaryHitChip from '@/components/GlossaryHitChip.vue'

defineProps<{
  hits: GlossaryHit[]
  /** When set, render as fixed overlay (source-text hover). */
  fixed?: boolean
  x?: number
  y?: number
}>()

defineEmits<{
  pick: [hit: GlossaryHit]
  panelEnter: []
  panelLeave: []
}>()

const { t } = useI18n()
</script>

<template>
  <ul
    class="glossary-hits-popover"
    :class="{ fixed }"
    :style="fixed ? { left: `${x ?? 0}px`, top: `${y ?? 0}px` } : undefined"
    :aria-label="t('glossary.hitsListLabel')"
    @mouseenter="$emit('panelEnter')"
    @mouseleave="$emit('panelLeave')"
  >
    <li v-for="hit in hits" :key="hit.termId">
      <GlossaryHitChip :hit="hit" @pick="$emit('pick', hit)" />
    </li>
  </ul>
</template>

<style scoped lang="scss">
.glossary-hits-popover {
  list-style: none;
  margin: 0;
  padding: 0.4rem;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.15rem;
  width: max-content;
  max-width: min(28rem, 80vw);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
  z-index: 20;
}
.glossary-hits-popover:not(.fixed) {
  position: absolute;
  top: calc(100% + 0.25rem);
  left: 50%;
  transform: translateX(-50%);
}
.glossary-hits-popover.fixed {
  position: fixed;
  z-index: 120;
  transform: none;
  pointer-events: auto;
}
</style>
