<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { createJob } from '@/jobs/api'
import {
  loadJobLangPairPresetId,
  saveJobLangPairFromCodes,
  saveJobLangPairPresetId,
} from '@/jobs/langPairPreference'
import { projectFingerprint } from '@/jobs/localProject'
import { createProjectId } from '@/storage/idb'
import {
  LANG_PAIR_PRESETS,
  findLangPairPreset,
  type LangPairPreset,
} from '@/tm/langPairs'
import type { Job } from '@/types/job'
import type { ProjectRecord } from '@/types/project'

const props = defineProps<{
  open: boolean
  /** When set — bind this project; otherwise create an empty shared-work card. */
  project?: ProjectRecord | null
}>()

const emit = defineEmits<{
  close: []
  created: [job: Job]
}>()

const { t } = useI18n()
const title = ref('')
const pairId = ref(loadJobLangPairPresetId())
const busy = ref(false)
const error = ref('')

function initPairId() {
  if (props.project) {
    const found = findLangPairPreset(
      props.project.meta.sourceLang,
      props.project.meta.targetLang,
    )
    pairId.value = found?.id ?? loadJobLangPairPresetId()
    return
  }
  pairId.value = loadJobLangPairPresetId()
}

watch(
  () => props.open,
  open => {
    if (!open) return
    title.value = props.project?.meta.name?.trim() || ''
    initPairId()
    error.value = ''
  },
  { immediate: true },
)

function selectedPreset(): LangPairPreset {
  return LANG_PAIR_PRESETS.find(preset => preset.id === pairId.value) ?? LANG_PAIR_PRESETS[0]!
}

async function submit() {
  const trimmed = title.value.trim()
  if (!trimmed || busy.value) return
  busy.value = true
  error.value = ''
  const preset = selectedPreset()
  saveJobLangPairPresetId(preset.id)
  try {
    if (props.project) {
      const fingerprint = await projectFingerprint(props.project)
      const job = await createJob({
        id: props.project.meta.id,
        title: trimmed,
        sourceLang: preset.sourceLang,
        targetLang: preset.targetLang,
        sourceFilename: fingerprint.filename,
        sourceHash: fingerprint.hash,
        localProjectId: props.project.meta.id,
      })
      saveJobLangPairFromCodes(preset.sourceLang, preset.targetLang)
      emit('created', job)
      return
    }
    const job = await createJob({
      id: createProjectId(),
      title: trimmed,
      sourceLang: preset.sourceLang,
      targetLang: preset.targetLang,
    })
    saveJobLangPairFromCodes(preset.sourceLang, preset.targetLang)
    emit('created', job)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="open" class="backdrop" role="presentation" @click.self="emit('close')">
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="project ? t('jobs.createTitle') : t('jobs.createEmptyTitle')"
    >
      <h2 class="title">
        {{ project ? t('jobs.createTitle') : t('jobs.createEmptyTitle') }}
      </h2>
      <p class="hint">
        {{ project ? t('jobs.createHint') : t('jobs.createEmptyHint') }}
      </p>

      <label class="field">
        <span>{{ t('jobs.titleLabel') }}</span>
        <input
          v-model="title"
          type="text"
          maxlength="160"
          :disabled="busy"
          @keydown.enter.prevent="submit"
        />
      </label>

      <label class="field">
        <span>{{ t('editor.langPairLabel') }}</span>
        <select v-model="pairId" class="select" :disabled="busy">
          <option v-for="preset in LANG_PAIR_PRESETS" :key="preset.id" :value="preset.id">
            {{ preset.label }}
          </option>
        </select>
      </label>

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <div class="actions">
        <button type="button" class="ghost" :disabled="busy" @click="emit('close')">
          {{ t('jobs.cancel') }}
        </button>
        <button type="button" class="primary" :disabled="busy || !title.trim()" @click="submit">
          {{ busy ? t('jobs.creating') : t('jobs.create') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 86;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: color-mix(in srgb, #000 45%, transparent);
}

.dialog {
  width: min(28rem, 100%);
  padding: 1.25rem 1.35rem 1.1rem;
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.28);
}

.title {
  margin: 0 0 0.35rem;
  font-size: 1.15rem;
}

.hint {
  margin: 0 0 1rem;
  color: var(--text-muted);
  font-size: 0.85rem;
  line-height: 1.45;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  color: var(--text-muted);
  font-size: 0.8rem;
  font-weight: 600;
}

input {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.55rem 0.7rem;
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 0.95rem;
}

.select {
  appearance: none;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.55rem 0.7rem;
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 0.95rem;
}

.error {
  margin: 0.75rem 0 0;
  color: var(--danger);
  font-size: 0.85rem;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1rem;
}

button {
  border: 0;
  border-radius: 8px;
  padding: 0.5rem 0.9rem;
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

button:disabled {
  cursor: default;
  opacity: 0.55;
}

.primary {
  background: var(--accent);
  color: #fff;
}

.ghost {
  background: transparent;
  color: var(--text-muted);
}
</style>
