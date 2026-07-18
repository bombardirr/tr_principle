<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import IconButton from '@/components/IconButton.vue'
import EditorGlyph from '@/components/EditorGlyph.vue'
import { ApiError } from '@/auth/api'
import { getProjectBackup } from '@/projects/api'
import { deleteProject, getProject, saveProject } from '@/storage/idb'
import { unpackProjectFile } from '@/storage/projectFile'
import { langPairLabel } from '@/tm/langPairs'
import { resegmentProjectRecord } from '@/tm/resegment'
import { SEGMENT_SCHEMA_DATE_SAFE, type ProjectMeta } from '@/types/project'

const props = defineProps<{
  project: ProjectMeta
  glow?: boolean
  /** Fallback when project meta has no langs yet (e.g. job hub). */
  sourceLang?: string
  targetLang?: string
}>()

const emit = defineEmits<{
  changed: []
  notice: [message: string]
  error: [message: string]
}>()

const { t } = useI18n()
const busy = ref(false)
const pending = ref<'delete' | 'resegment' | null>(null)
/** Inline resegment button feedback: spinner → check → idle. */
const resegmentFlash = ref<'spin' | 'ok' | null>(null)

const langPairText = computed(() => {
  const source = props.project.sourceLang || props.sourceLang
  const target = props.project.targetLang || props.targetLang
  if (!source && !target) return ''
  return langPairLabel(source, target)
})

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function cancelPending() {
  pending.value = null
}

async function confirmRemove() {
  await deleteProject(props.project.id)
  pending.value = null
  emit('changed')
}

function sleep(ms: number) {
  return new Promise<void>(resolve => {
    setTimeout(resolve, ms)
  })
}

async function confirmResegment() {
  busy.value = true
  pending.value = null
  resegmentFlash.value = 'spin'
  emit('error', '')
  emit('notice', '')
  const started = Date.now()
  try {
    const record = await getProject(props.project.id)
    if (!record) throw new Error('Project not found')
    const { segments, ambiguousCount } = await resegmentProjectRecord(record)
    record.segments = segments
    record.meta.segmentSchemaVersion = SEGMENT_SCHEMA_DATE_SAFE
    record.meta.segmentCount = segments.length
    await saveProject(record)
    emit('changed')
    if (ambiguousCount > 0) {
      emit('notice', t('projects.resegmentAmbiguous', { name: props.project.name, n: ambiguousCount }))
    }
    const elapsed = Date.now() - started
    if (elapsed < 1000) await sleep(1000 - elapsed)
    resegmentFlash.value = 'ok'
    await sleep(500)
  } catch (err) {
    emit('error', err instanceof Error ? err.message : String(err))
  } finally {
    resegmentFlash.value = null
    busy.value = false
  }
}

async function restoreFromCloud() {
  const local = await getProject(props.project.id)
  if (local && !window.confirm(t('projects.restoreCloudOverwrite', { name: props.project.name }))) {
    return
  }
  busy.value = true
  emit('error', '')
  emit('notice', '')
  try {
    const bytes = await getProjectBackup(props.project.id)
    const record = await unpackProjectFile(bytes)
    await saveProject(record)
    emit('changed')
    emit('notice', t('projects.restoreCloudOk', { name: record.meta.name || props.project.name }))
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      emit('error', t('projects.restoreCloudMissing'))
    } else {
      emit('error', err instanceof Error ? err.message : String(err))
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <li class="item" :class="{ 'job-related-glow': glow }">
    <router-link class="item-link" :to="{ name: 'editor', params: { id: project.id } }">
      <span class="name">{{ project.name }}</span>
      <span class="sub">
        <template v-if="langPairText">{{ langPairText }} · </template>
        {{ t('projects.segments', { done: project.doneCount, total: project.segmentCount }) }}
        ·
        {{ t('projects.updated', { date: formatDate(project.updatedAt) }) }}
      </span>
    </router-link>
    <div class="item-actions" @click.stop>
      <template v-if="pending === 'resegment'">
        <div class="action-confirm">
          <IconButton
            :title="t('projects.confirmResegment', { name: project.name })"
            :disabled="busy"
            @click="confirmResegment"
          >
            <EditorGlyph name="check" />
          </IconButton>
          <IconButton :title="t('projects.deleteCancel')" @click="cancelPending">
            <EditorGlyph name="close" />
          </IconButton>
        </div>
      </template>
      <template v-else-if="pending === 'delete'">
        <div class="action-confirm">
          <IconButton
            danger
            :title="t('projects.confirmDelete', { name: project.name })"
            @click="confirmRemove"
          >
            <EditorGlyph name="check" />
          </IconButton>
          <IconButton :title="t('projects.deleteCancel')" @click="cancelPending">
            <EditorGlyph name="close" />
          </IconButton>
        </div>
      </template>
      <template v-else>
        <IconButton
          :title="t('projects.restoreCloudHint')"
          :disabled="busy"
          @click="restoreFromCloud"
        >
          <EditorGlyph name="cloud-download" />
        </IconButton>
        <IconButton
          class="resegment-btn"
          :class="{
            'resegment-btn--spin': resegmentFlash === 'spin',
            'resegment-btn--ok': resegmentFlash === 'ok',
          }"
          :title="t('projects.resegment')"
          :disabled="busy"
          @click="pending = 'resegment'"
        >
          <EditorGlyph
            v-if="resegmentFlash === 'spin'"
            class="glyph-spin"
            name="spinner"
          />
          <EditorGlyph v-else-if="resegmentFlash === 'ok'" name="check" />
          <EditorGlyph v-else name="resegment" />
        </IconButton>
        <IconButton
          danger
          :title="t('projects.delete')"
          :disabled="busy"
          @click="pending = 'delete'"
        >
          <EditorGlyph name="trash" />
        </IconButton>
      </template>
    </div>
  </li>
</template>

<style scoped lang="scss">
.item {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.5rem 0.35rem 0.5rem 0.65rem;
  margin-bottom: 0.45rem;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.2s ease;
}

.item:hover {
  background: var(--surface);
  border-color: var(--border-strong);
}

.item.job-related-glow {
  border-color: color-mix(in srgb, var(--accent) 70%, var(--border-strong));
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent),
    0 0 14px color-mix(in srgb, var(--accent) 28%, transparent),
    0 0 28px color-mix(in srgb, var(--accent) 14%, transparent);
}

.item-link {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  text-decoration: none;
  color: inherit;
}

.name {
  font-weight: 600;
  color: var(--text);
  min-width: 0;
}

.sub {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.item-actions {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 0.05rem;
}

.action-confirm {
  display: inline-flex;
  align-items: center;
  gap: 0.05rem;
}

:deep(.glyph-spin) {
  animation: resegment-spin 0.7s linear infinite;
}

:deep(.resegment-btn.resegment-btn--spin),
:deep(.resegment-btn.resegment-btn--spin:disabled) {
  color: #4db8ff !important;
  opacity: 1;
}

:deep(.resegment-btn.resegment-btn--ok),
:deep(.resegment-btn.resegment-btn--ok:disabled) {
  color: #3dd68c !important;
  opacity: 1;
}

@keyframes resegment-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
