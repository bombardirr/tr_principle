<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  cancel: []
  continue: []
}>()

const { t } = useI18n()
</script>

<template>
  <div v-if="open" class="backdrop" role="presentation" @click.self="emit('cancel')">
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="t('editor.sharedTmWarnTitle')"
    >
      <h2 class="title">{{ t('editor.sharedTmWarnTitle') }}</h2>
      <p class="hint">{{ t('editor.sharedTmWarnBody') }}</p>
      <div class="actions">
        <button type="button" class="ghost" @click="emit('cancel')">
          {{ t('editor.sharedTmWarnCancel') }}
        </button>
        <button type="button" class="primary" @click="emit('continue')">
          {{ t('editor.sharedTmWarnContinue') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
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

.hint {
  margin: 0 0 0.75rem;
  font-size: 0.85rem;
  line-height: 1.45;
  color: var(--text-muted);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.35rem;
}

.actions .ghost,
.actions .primary {
  border-radius: 6px;
  padding: 0.35rem 0.7rem;
  cursor: pointer;
  border: 1px solid transparent;
  font-size: 0.8rem;
  font-weight: 600;
}

.actions .ghost {
  background: transparent;
  color: var(--text);
  border-color: var(--border-strong);
}

.actions .primary {
  background: var(--accent);
  color: var(--accent-text);
  border-color: var(--accent-strong);
}
</style>
