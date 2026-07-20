<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { patchJobResourceMe, patchJobResourcePreset } from '@/jobs/tmApi'
import { jobTmReadable, jobTmWritable, loadJobResource } from '@/jobs/resources'
import { syncJobTm } from '@/jobs/tmSync'
import type { JobResource, JobRole } from '@/types/job'

const props = defineProps<{
  jobId: string
  isOwner: boolean
  myRole: JobRole | null
}>()

const { t } = useI18n()
const resource = ref<JobResource | null>(null)
const loading = ref(false)
const busy = ref(false)
const error = ref('')

const isViewer = computed(() => props.myRole === 'viewer')
const canChange = computed(() => !isViewer.value && !busy.value)
const readEnabled = computed(() => jobTmReadable(resource.value))
const writeEnabled = computed(() => jobTmWritable(resource.value))
const presetAllowsWrite = computed(() => Boolean(resource.value?.preset.canWrite))
const canChangeWrite = computed(() => canChange.value && (props.isOwner || presetAllowsWrite.value))

watch(
  () => props.jobId,
  () => void load(),
  { immediate: true }
)

async function load() {
  loading.value = true
  error.value = ''
  try {
    resource.value = await loadJobResource(props.jobId)
  } finally {
    loading.value = false
  }
}

function online(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine
}

async function updateRead(enabled: boolean) {
  if (!canChange.value || !online()) {
    if (!online()) error.value = t('jobs.memoriesNeedNetwork')
    return
  }

  busy.value = true
  error.value = ''
  try {
    resource.value = props.isOwner
      ? await patchJobResourcePreset(props.jobId, {
          enabled,
          ...(enabled ? { canRead: true } : {}),
        })
      : await patchJobResourceMe(props.jobId, { enabled })
    if (props.isOwner && enabled && jobTmReadable(resource.value)) void syncJobTm(props.jobId)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function updateWrite(canWrite: boolean) {
  if (!canChangeWrite.value || !online()) {
    if (!online()) error.value = t('jobs.memoriesNeedNetwork')
    return
  }

  busy.value = true
  error.value = ''
  try {
    resource.value = props.isOwner
      ? await patchJobResourcePreset(props.jobId, { canWrite })
      : await patchJobResourceMe(props.jobId, { canWrite })
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="memories" :aria-busy="loading">
    <h3>{{ t('jobs.memoriesTitle') }}</h3>

    <div class="memory-row personal">
      <span>
        <strong>{{ t('jobs.memoriesPersonal') }}</strong>
        <small>{{ t('jobs.memoriesPersonalHint') }}</small>
      </span>
    </div>

    <div class="memory-row job">
      <strong>{{ t('jobs.memoriesJob') }}</strong>
      <span class="toggles">
        <label v-if="!isViewer || resource?.preset.canRead" class="check">
          <input
            data-testid="job-tm-read"
            type="checkbox"
            :checked="readEnabled"
            :disabled="!canChange"
            @change="updateRead(($event.target as HTMLInputElement).checked)"
          />
          <span>{{ t('jobs.memoriesRead') }}</span>
        </label>
        <label v-if="!isViewer" class="check">
          <input
            data-testid="job-tm-write"
            type="checkbox"
            :checked="writeEnabled"
            :disabled="!canChangeWrite"
            @change="updateWrite(($event.target as HTMLInputElement).checked)"
          />
          <span>{{ t('jobs.memoriesWrite') }}</span>
        </label>
      </span>
    </div>

    <p v-if="!readEnabled" class="muted">{{ t('jobs.memoriesJobOff') }}</p>
    <p v-if="writeEnabled" class="privacy">{{ t('jobs.memoriesWritePrivacy') }}</p>
    <p v-if="isViewer" class="muted">{{ t('jobs.memoriesViewerNoWrite') }}</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
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
.memory-row > span,
.toggles,
.check {
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

.toggles {
  gap: 0.55rem;
}

.check {
  gap: 0.3rem;
  white-space: nowrap;
}

small,
.muted,
.privacy {
  color: var(--text-muted);
  font-size: 0.72rem;
}

.muted,
.privacy {
  margin: 0.25rem 0 0;
}

.privacy {
  color: var(--danger);
}

.error {
  margin: 0.3rem 0 0;
  color: var(--danger);
  font-size: 0.8rem;
}
</style>
