<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { JobRole } from '@/types/job'

defineProps<{
  jobId: string
  isOwner: boolean
  myRole: JobRole | null
}>()

const { t } = useI18n()
</script>

<template>
  <section class="memories">
    <h3>{{ t('jobs.memoriesTitle') }}</h3>

    <div class="memory-row personal">
      <span>
        <strong>{{ t('jobs.memoriesPersonal') }}</strong>
        <small>{{ t('jobs.memoriesPersonalHint') }}</small>
      </span>
    </div>

    <div class="attachments">
      <strong class="attachments-title">{{ t('jobs.memoriesAttachedTitle') }}</strong>
      <p class="muted">{{ t('jobs.memoriesAttachedEmpty') }}</p>
    </div>
  </section>
</template>

<style scoped lang="scss">
.memories {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border);
}

h3 {
  margin: 0 0 0.4rem;
  font-size: 0.8rem;
}

.memory-row,
.memory-row > span {
  display: flex;
  align-items: center;
}

.memory-row {
  justify-content: space-between;
  gap: 0.65rem;
  padding: 0.35rem 0;
  font-size: 0.8rem;
}

.personal > span {
  flex-direction: column;
  align-items: flex-start;
  gap: 0.05rem;
}

.attachments {
  margin-top: 0.35rem;
  padding-top: 0.35rem;
  border-top: 1px dashed color-mix(in srgb, var(--border) 80%, transparent);
}

.attachments-title {
  display: block;
  font-size: 0.8rem;
  margin-bottom: 0.2rem;
}

small,
.muted {
  color: var(--text-muted);
  font-size: 0.72rem;
}

.muted {
  margin: 0;
  line-height: 1.4;
}
</style>
