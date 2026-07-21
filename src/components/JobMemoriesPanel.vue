<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import EditorGlyph from '@/components/EditorGlyph.vue'
import TmCollectionDialog from '@/components/TmCollectionDialog.vue'
import {
  createJobTmAttachment,
  deleteJobTmAttachment,
  listJobTmAttachmentsApi,
  patchJobTmAttachment,
} from '@/jobs/tmAttachmentsApi'
import {
  attachJobTm,
  detachJobTm,
  listJobTmAttachments,
  updateJobTmAttachment,
} from '@/tm/jobAttachments'
import { PERSONAL_TM_ATTACHMENT_ID } from '@/tm/projectAttachments'
import { listTmCatalog } from '@/tm/tmBasesCatalog'
import { upsertSharedTmBase } from '@/storage/tmBasesIdb'
import { syncTmBase } from '@/tm/sync'
import type { TmAttachmentCatalogItem } from '@/tm/projectAttachments'
import type { JobRole, JobTmAttachment } from '@/types/job'
import type { ProjectTmAttachmentId } from '@/types/project'

const props = defineProps<{
  jobId: string
  isOwner: boolean
  myRole: JobRole | null
}>()

const { t } = useI18n()
const shared = ref<JobTmAttachment[]>([])
const localOverlay = ref(listJobTmAttachments(props.jobId))
const loadError = ref<string | null>(null)
const collectionOpen = ref(false)
const collectionMode = ref<'pick' | 'browse'>('pick')
const collectionReturnTo = ref<'job' | null>(null)
const pickerTarget = ref<'shared' | 'local'>('local')
const catalog = ref<TmAttachmentCatalogItem[]>([])
let jobGeneration = 0
let sharedRequestGeneration = 0
const attachedIds = computed<ProjectTmAttachmentId[]>(() =>
  pickerTarget.value === 'shared'
    ? shared.value.map(item => item.tmBaseId)
    : localOverlay.value.map(item => item.id)
)

async function refreshCatalog() {
  try {
    catalog.value = await listTmCatalog()
  } catch {
    catalog.value = []
  }
}

watch(
  () => props.jobId,
  jobId => {
    jobGeneration += 1
    shared.value = []
    localOverlay.value = listJobTmAttachments(jobId)
    void refreshShared()
    void refreshCatalog()
  }
)

onMounted(() => {
  void refreshShared()
  void refreshCatalog()
})

async function refreshShared(options: { keepError?: boolean } = {}) {
  const jobId = props.jobId
  const generation = jobGeneration
  const requestGeneration = ++sharedRequestGeneration
  if (!options.keepError) loadError.value = null
  try {
    const attachments = await listJobTmAttachmentsApi(jobId)
    if (!isCurrentRequest(jobId, generation, requestGeneration)) return
    shared.value = attachments
    for (const attachment of attachments) {
      if (!attachment.canRead) continue
      try {
        await upsertSharedTmBase({
          id: attachment.tmBaseId,
          label: attachment.label ?? attachment.tmBaseId,
          color: attachment.color ?? '#5b9fd4',
        })
        await syncTmBase(attachment.tmBaseId, { jobId })
      } catch (error) {
        if (!isCurrentRequest(jobId, generation, requestGeneration)) return
        loadError.value = error instanceof Error ? error.message : String(error)
      }
      if (!isCurrentRequest(jobId, generation, requestGeneration)) return
    }
  } catch (error) {
    if (!isCurrentRequest(jobId, generation, requestGeneration)) return
    loadError.value = error instanceof Error ? error.message : String(error)
    shared.value = []
  }
}

function isCurrentJob(jobId: string, generation: number) {
  return props.jobId === jobId && jobGeneration === generation
}

function isCurrentRequest(jobId: string, generation: number, requestGeneration: number) {
  return isCurrentJob(jobId, generation) && sharedRequestGeneration === requestGeneration
}

function catalogItem(id: string) {
  return catalog.value.find(item => item.id === id)
}

function itemLabel(id: string, sharedLabel?: string) {
  const item = catalogItem(id)
  return id === PERSONAL_TM_ATTACHMENT_ID
    ? t('projects.tmPersonalBase')
    : (sharedLabel ?? item?.label ?? id)
}

function openPick(target: 'shared' | 'local') {
  pickerTarget.value = target
  collectionMode.value = 'pick'
  collectionReturnTo.value = 'job'
  collectionOpen.value = true
}

function openFullFromPick() {
  collectionMode.value = 'browse'
  collectionReturnTo.value = 'job'
}

function closeCollection() {
  collectionOpen.value = false
  collectionReturnTo.value = null
}

async function attach(id: ProjectTmAttachmentId) {
  if (pickerTarget.value === 'shared') {
    await attachShared(id)
    return
  }
  localOverlay.value = attachJobTm(props.jobId, id)
  closeCollection()
}

async function attachShared(tmBaseId: ProjectTmAttachmentId) {
  if (!props.isOwner) return
  const jobId = props.jobId
  const generation = jobGeneration
  loadError.value = null
  try {
    const created = await createJobTmAttachment(jobId, {
      tmBaseId,
      canRead: true,
      canWrite: true,
    })
    if (!isCurrentJob(jobId, generation)) return
    shared.value = [...shared.value, created]
    closeCollection()
  } catch (error) {
    if (!isCurrentJob(jobId, generation)) return
    loadError.value = error instanceof Error ? error.message : String(error)
    await refreshShared({ keepError: true })
  }
}

async function detachShared(attachmentId: string) {
  if (!props.isOwner) return
  const jobId = props.jobId
  const generation = jobGeneration
  loadError.value = null
  try {
    await deleteJobTmAttachment(jobId, attachmentId)
    if (!isCurrentJob(jobId, generation)) return
    shared.value = shared.value.filter(item => item.id !== attachmentId)
  } catch (error) {
    if (!isCurrentJob(jobId, generation)) return
    loadError.value = error instanceof Error ? error.message : String(error)
    await refreshShared({ keepError: true })
  }
}

async function toggleShared(
  attachmentId: string,
  permission: 'canRead' | 'canWrite',
  value: boolean
) {
  if (!props.isOwner) return
  const jobId = props.jobId
  const generation = jobGeneration
  loadError.value = null
  try {
    const updated = await patchJobTmAttachment(jobId, attachmentId, {
      [permission]: value,
    })
    if (!isCurrentJob(jobId, generation)) return
    shared.value = shared.value.map(item => (item.id === updated.id ? updated : item))
  } catch (error) {
    if (!isCurrentJob(jobId, generation)) return
    loadError.value = error instanceof Error ? error.message : String(error)
    await refreshShared({ keepError: true })
  }
}

function detachLocal(id: ProjectTmAttachmentId) {
  localOverlay.value = detachJobTm(props.jobId, id)
}

function toggleLocal(
  id: ProjectTmAttachmentId,
  permission: 'canRead' | 'canWrite',
  value: boolean
) {
  localOverlay.value = updateJobTmAttachment(props.jobId, id, { [permission]: value })
}
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

    <div class="attachments shared-attachments">
      <div class="attachments-header">
        <strong class="attachments-title">{{ t('jobs.memoriesJobBasesTitle') }}</strong>
        <button
          v-if="isOwner"
          type="button"
          class="add"
          data-testid="job-tm-add"
          :aria-label="t('jobs.memoriesAttach')"
          :title="t('jobs.memoriesAttach')"
          @click="openPick('shared')"
        >
          <EditorGlyph name="plus" />
        </button>
      </div>

      <p v-if="loadError" class="error">{{ loadError }}</p>
      <p v-if="shared.length === 0" class="muted">
        {{ t('jobs.memoriesJobBasesEmpty') }}
      </p>

      <div v-else class="bases">
        <article v-for="attachment in shared" :key="attachment.id" class="base-card">
          <span
            class="glyph"
            :style="{
              '--tm-color':
                attachment.color ?? catalogItem(attachment.tmBaseId)?.color ?? 'var(--accent)',
            }"
          >
            <EditorGlyph :name="catalogItem(attachment.tmBaseId)?.glyph ?? 'tm'" />
          </span>
          <strong class="base-name">
            {{ itemLabel(attachment.tmBaseId, attachment.label) }}
          </strong>
          <label class="permission" :title="t('projects.tmPermRead')">
            <span>{{ t('projects.tmPermReadShort') }}</span>
            <input
              data-testid="job-tm-shared-read"
              type="checkbox"
              :checked="attachment.canRead"
              :disabled="!isOwner"
              @change="
                toggleShared(attachment.id, 'canRead', ($event.target as HTMLInputElement).checked)
              "
            />
          </label>
          <label class="permission" :title="t('projects.tmPermWrite')">
            <span>{{ t('projects.tmPermWriteShort') }}</span>
            <input
              data-testid="job-tm-shared-write"
              type="checkbox"
              :checked="attachment.canWrite"
              :disabled="!isOwner"
              @change="
                toggleShared(attachment.id, 'canWrite', ($event.target as HTMLInputElement).checked)
              "
            />
          </label>
          <button
            v-if="isOwner"
            type="button"
            class="detach"
            data-testid="job-tm-shared-detach"
            :aria-label="t('jobs.memoriesDetach')"
            :title="t('jobs.memoriesDetach')"
            @click="detachShared(attachment.id)"
          >
            −
          </button>
        </article>
      </div>
    </div>

    <div class="attachments local-attachments">
      <div class="attachments-header">
        <span>
          <strong class="attachments-title">{{ t('jobs.memoriesLocalOverlayTitle') }}</strong>
          <small class="overlay-hint">{{ t('jobs.memoriesLocalOverlayHint') }}</small>
        </span>
        <button
          type="button"
          class="add"
          data-testid="job-tm-local-add"
          :aria-label="t('jobs.memoriesAttach')"
          :title="t('jobs.memoriesAttach')"
          @click="openPick('local')"
        >
          <EditorGlyph name="plus" />
        </button>
      </div>

      <p v-if="localOverlay.length === 0" class="muted">
        {{ t('jobs.memoriesLocalOverlayEmpty') }}
      </p>

      <div v-else class="bases">
        <article v-for="attachment in localOverlay" :key="attachment.id" class="base-card">
          <span
            class="glyph"
            :style="{ '--tm-color': catalogItem(attachment.id)?.color ?? 'var(--accent)' }"
          >
            <EditorGlyph :name="catalogItem(attachment.id)?.glyph ?? 'tm'" />
          </span>
          <strong class="base-name">{{ itemLabel(attachment.id) }}</strong>
          <label class="permission" :title="t('projects.tmPermRead')">
            <span>{{ t('projects.tmPermReadShort') }}</span>
            <input
              data-testid="job-tm-local-read"
              type="checkbox"
              :checked="attachment.canRead"
              @change="
                toggleLocal(attachment.id, 'canRead', ($event.target as HTMLInputElement).checked)
              "
            />
          </label>
          <label class="permission" :title="t('projects.tmPermWrite')">
            <span>{{ t('projects.tmPermWriteShort') }}</span>
            <input
              data-testid="job-tm-local-write"
              type="checkbox"
              :checked="attachment.canWrite"
              @change="
                toggleLocal(attachment.id, 'canWrite', ($event.target as HTMLInputElement).checked)
              "
            />
          </label>
          <button
            type="button"
            class="detach"
            data-testid="job-tm-local-detach"
            :aria-label="t('jobs.memoriesDetach')"
            :title="t('jobs.memoriesDetach')"
            @click="detachLocal(attachment.id)"
          >
            −
          </button>
        </article>
      </div>
    </div>

    <TmCollectionDialog
      :open="collectionOpen"
      :mode="collectionMode"
      :return-to="collectionReturnTo"
      :attached-ids="attachedIds"
      :context-label="jobId"
      @close="closeCollection"
      @attach="attach"
      @open-full="openFullFromPick"
    />
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

.attachments-header,
.base-card,
.permission {
  display: flex;
  align-items: center;
}

.attachments-header {
  justify-content: space-between;
  gap: 0.5rem;
}

.attachments-header > span {
  display: flex;
  flex-direction: column;
  gap: 0.05rem;
}

.attachments-title {
  font-size: 0.8rem;
}

.add,
.detach {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.add {
  color: var(--accent);
}

.bases {
  display: grid;
  gap: 0.45rem;
  margin-top: 0.45rem;
}

.base-card {
  gap: 0.55rem;
  padding: 0.45rem;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface-2);
}

.glyph {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: 8px;
  background: color-mix(in srgb, var(--tm-color) 18%, transparent);
  color: var(--tm-color);
}

.base-name {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 0.8rem;
}

.permission {
  gap: 0.2rem;
  color: var(--text-muted);
  font-size: 0.72rem;
}

.detach {
  color: var(--danger);
  font-size: 1.2rem;
}

small,
.muted {
  color: var(--text-muted);
  font-size: 0.72rem;
}

.overlay-hint {
  display: block;
}

.muted {
  margin: 0.2rem 0 0;
  line-height: 1.4;
}

.error {
  margin: 0.2rem 0 0;
  color: var(--danger);
  font-size: 0.72rem;
}

@media (max-width: 30rem) {
  .base-card {
    flex-wrap: wrap;
  }

  .base-name {
    flex-basis: calc(100% - 2.55rem);
  }
}
</style>
