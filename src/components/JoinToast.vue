<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useJoinToast } from '@/jobs/joinActivity'

const { t } = useI18n()
const { toast, toastVisible } = useJoinToast()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="toast"
      class="join-toast"
      :class="{ 'is-in': toastVisible }"
      role="status"
      aria-live="polite"
    >
      <p class="join-toast__title">{{ t('jobs.joinToastTitle') }}</p>
      <p class="join-toast__body">
        {{ t('jobs.joinToastBody', { name: toast.memberName, work: toast.jobTitle }) }}
      </p>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.join-toast {
  position: fixed;
  top: 4.5rem;
  right: 1rem;
  z-index: 80;
  width: min(22rem, calc(100vw - 2rem));
  padding: 0.85rem 1rem;
  border-radius: 10px;
  border: 1px solid var(--border-strong);
  background: var(--surface);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28);
  transform: translateX(calc(100% + 1.5rem));
  opacity: 0;
  transition:
    transform 0.32s ease,
    opacity 0.32s ease;
  pointer-events: none;
}

.join-toast.is-in {
  transform: translateX(0);
  opacity: 1;
}

.join-toast__title {
  margin: 0 0 0.25rem;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--text);
}

.join-toast__body {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.4;
  color: var(--text-muted);
}
</style>
