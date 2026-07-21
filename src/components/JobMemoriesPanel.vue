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
import { listTmBases, sharedTmLocalId, upsertSharedTmBase } from '@/storage/tmBasesIdb'
import { syncTmBase } from '@/tm/sync'
import { cloneSharedJobTm, exportSharedJobTm } from '@/tm/jobTmIo'
import type { TmAttachmentCatalogItem } from '@/tm/projectAttachments'
import type { TmBaseRecord } from '@/storage/tmBasesIdb'
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
const ioNotice = ref<string | null>(null)
const actionBusyId = ref<string | null>(null)
const cloneSource = ref<JobTmAttachment | null>(null)
const cloneTargets = ref<TmBaseRecord[]>([])
const cloneTargetId = ref('')
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
    cloneSource.value = null
    cloneTargets.value = []
    cloneTargetId.value = ''
    ioNotice.value = null
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
        const localId = sharedTmLocalId(
          attachment.ownerId || attachment.createdBy,
          attachment.tmBaseId
        )
        await upsertSharedTmBase({
          id: localId,
          label: attachment.label ?? attachment.tmBaseId,
          color: attachment.color ?? '#5b9fd4',
        })
        await syncTmBase(localId, { jobId })
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
  permission: 'canRead' | 'canWrite' | 'canExport' | 'canClone',
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

async function exportShared(attachment: JobTmAttachment) {
  if (!attachment.canRead || !attachment.canExport || !attachment.ownerId) return
  const jobId = props.jobId
  const generation = jobGeneration
  actionBusyId.value = attachment.id
  loadError.value = null
  ioNotice.value = null
  try {
    const result = await exportSharedJobTm({
      jobId,
      ownerId: attachment.ownerId,
      tmBaseId: attachment.tmBaseId,
      label: attachment.label,
    })
    if (!isCurrentJob(jobId, generation)) return
    ioNotice.value =
      result.count === 0
        ? t('projects.tmIoEmpty')
        : t('projects.tmExported', { count: result.count })
  } catch (error) {
    if (!isCurrentJob(jobId, generation)) return
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    if (isCurrentJob(jobId, generation)) actionBusyId.value = null
  }
}

async function openClone(attachment: JobTmAttachment) {
  if (!attachment.canRead || !attachment.canClone || !attachment.ownerId) return
  const jobId = props.jobId
  const generation = jobGeneration
  loadError.value = null
  ioNotice.value = null
  try {
    const bases = (await listTmBases()).filter(base => base.sharedOnly !== true)
    if (!isCurrentJob(jobId, generation)) return
    cloneTargets.value = bases
    cloneTargetId.value = cloneTargets.value[0]?.id ?? ''
    cloneSource.value = attachment
  } catch (error) {
    if (!isCurrentJob(jobId, generation)) return
    loadError.value = error instanceof Error ? error.message : String(error)
  }
}

function closeClone() {
  cloneSource.value = null
  cloneTargets.value = []
  cloneTargetId.value = ''
}

async function confirmClone() {
  const attachment = cloneSource.value
  if (!attachment?.ownerId || !cloneTargetId.value) return
  const jobId = props.jobId
  const generation = jobGeneration
  actionBusyId.value = attachment.id
  loadError.value = null
  ioNotice.value = null
  try {
    const result = await cloneSharedJobTm({
      jobId,
      ownerId: attachment.ownerId,
      tmBaseId: attachment.tmBaseId,
      targetBaseId: cloneTargetId.value,
    })
    if (!isCurrentJob(jobId, generation)) return
    closeClone()
    ioNotice.value =
      result.count === 0 ? t('projects.tmIoEmpty') : t('projects.tmCloned', { count: result.count })
  } catch (error) {
    if (!isCurrentJob(jobId, generation)) return
    loadError.value = error instanceof Error ? error.message : String(error)
  } finally {
    if (isCurrentJob(jobId, generation)) actionBusyId.value = null
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
      <p v-if="ioNotice" class="notice">{{ ioNotice }}</p>
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
          <label class="permission" :title="t('projects.tmPermExport')">
            <span>{{ t('projects.tmPermExportShort') }}</span>
            <input
              data-testid="job-tm-shared-export"
              type="checkbox"
              :checked="attachment.canExport"
              :disabled="!isOwner"
              @change="
                toggleShared(
                  attachment.id,
                  'canExport',
                  ($event.target as HTMLInputElement).checked
                )
              "
            />
          </label>
          <label class="permission" :title="t('projects.tmPermClone')">
            <span>{{ t('projects.tmPermCloneShort') }}</span>
            <input
              data-testid="job-tm-shared-clone"
              type="checkbox"
              :checked="attachment.canClone"
              :disabled="!isOwner"
              @change="
                toggleShared(attachment.id, 'canClone', ($event.target as HTMLInputElement).checked)
              "
            />
          </label>
          <button
            v-if="attachment.canRead && attachment.canExport && attachment.ownerId"
            type="button"
            class="io-action"
            data-testid="job-tm-export"
            :disabled="actionBusyId === attachment.id"
            @click="exportShared(attachment)"
          >
            {{ t('projects.tmExportTmx') }}
          </button>
          <button
            v-if="attachment.canRead && attachment.canClone && attachment.ownerId"
            type="button"
            class="io-action"
            data-testid="job-tm-clone"
            :disabled="actionBusyId === attachment.id"
            @click="openClone(attachment)"
          >
            {{ t('projects.tmClone') }}
          </button>
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

    <div v-if="cloneSource" class="clone-backdrop" role="presentation" @click.self="closeClone">
      <section
        class="clone-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="t('projects.tmCloneTitle')"
      >
        <h3>{{ t('projects.tmCloneTitle') }}</h3>
        <label>
          <span>{{ t('projects.tmCloneTarget') }}</span>
          <select v-model="cloneTargetId" data-testid="job-tm-clone-target">
            <option v-for="base in cloneTargets" :key="base.id" :value="base.id">
              {{ base.label }}
            </option>
          </select>
        </label>
        <div class="clone-actions">
          <button type="button" :disabled="actionBusyId !== null" @click="closeClone">
            {{ t('projects.tmCloneCancel') }}
          </button>
          <button
            type="button"
            data-testid="job-tm-clone-confirm"
            :disabled="!cloneTargetId || actionBusyId !== null"
            @click="confirmClone"
          >
            {{ t('projects.tmCloneConfirm') }}
          </button>
        </div>
      </section>
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
.detach,
.io-action {
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

.io-action {
  width: auto;
  padding: 0 0.4rem;
  color: var(--accent);
  font-size: 0.7rem;
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

.error,
.notice {
  margin: 0.2rem 0 0;
  font-size: 0.72rem;
}

.error {
  color: var(--danger);
}

.notice {
  color: var(--text-muted);
}

.clone-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: color-mix(in srgb, #000 45%, transparent);
}

.clone-dialog {
  width: min(24rem, 100%);
  padding: 1rem;
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);

  h3 {
    margin-top: 0;
  }

  label {
    display: grid;
    gap: 0.35rem;
  }

  select {
    width: 100%;
  }
}

.clone-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1rem;
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
