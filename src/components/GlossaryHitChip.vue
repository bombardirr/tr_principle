<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { GlossaryHit } from '@/types/glossary'

defineProps<{
  hit: Pick<GlossaryHit, 'sourceTerm' | 'targetTerm' | 'status'>
}>()

defineEmits<{
  pick: []
}>()

const { t } = useI18n()
</script>

<template>
  <button
    type="button"
    class="glossary-hit-chip"
    :class="{ forbidden: hit.status === 'forbidden' }"
    :disabled="hit.status === 'forbidden'"
    :aria-label="
      hit.status === 'forbidden'
        ? t('glossary.forbiddenHint')
        : `${hit.sourceTerm} → ${hit.targetTerm}. ${t('glossary.insertTarget')}`
    "
    @mousedown.prevent
    @click="$emit('pick')"
  >
    <span class="gh-src">{{ hit.sourceTerm }}</span>
    <span class="gh-arrow" aria-hidden="true">→</span>
    <span class="gh-tgt">{{ hit.targetTerm }}</span>
  </button>
</template>

<style scoped lang="scss">
.glossary-hit-chip {
  font: inherit;
  font-size: 0.72rem;
  line-height: 1.25;
  cursor: pointer;
  display: inline-flex;
  align-items: baseline;
  flex-wrap: nowrap;
  gap: 0.25rem;
  padding: 0.25rem 0.4rem;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  text-align: left;
  width: 100%;
  white-space: nowrap;
  max-width: 100%;
}
.glossary-hit-chip:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.glossary-hit-chip:disabled,
.glossary-hit-chip.forbidden {
  cursor: help;
  color: var(--danger);
  opacity: 0.95;
}
.gh-src {
  font-weight: 600;
}
.gh-arrow {
  opacity: 0.45;
  flex-shrink: 0;
}
.gh-tgt {
  opacity: 0.85;
}
</style>
