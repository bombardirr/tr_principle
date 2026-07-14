<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  later: []
  confirm: []
}>()

const { t } = useI18n()
</script>

<template>
  <div v-if="open" class="backdrop" role="presentation">
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="t('editor.resegmentTitle')"
    >
      <h2 class="title">{{ t('editor.resegmentTitle') }}</h2>
      <p class="hint">{{ t('editor.resegmentHint') }}</p>
      <p class="warn">{{ t('editor.resegmentWarn') }}</p>
      <div class="actions">
        <button type="button" class="ghost" @click="emit('later')">
          {{ t('editor.resegmentLater') }}
        </button>
        <button type="button" class="primary" @click="emit('confirm')">
          {{ t('editor.resegmentConfirm') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 85;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: color-mix(in srgb, #000 45%, transparent);
}

.dialog {
  width: min(26rem, 100%);
  padding: 1.25rem 1.35rem 1.1rem;
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.28);
}

.title {
  margin: 0 0 0.35rem;
  font-size: 1.15rem;
  font-weight: 700;
}

.hint,
.warn {
  margin: 0 0 0.75rem;
  font-size: 0.85rem;
  line-height: 1.45;
  color: var(--text-muted);
}

.warn {
  color: var(--text);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.primary,
.ghost {
  border: 0;
  border-radius: 8px;
  padding: 0.5rem 0.9rem;
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.primary {
  background: var(--accent);
  color: #fff;
}

.ghost {
  background: transparent;
  color: var(--text-muted);
}

.ghost:hover {
  color: var(--text);
}
</style>
