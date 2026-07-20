<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import EditorGlyph from '@/components/EditorGlyph.vue'
import TmCollectionDialog from '@/components/TmCollectionDialog.vue'
import {
  attachJobTm,
  detachJobTm,
  listJobTmAttachments,
  updateJobTmAttachment,
} from '@/tm/jobAttachments'
import {
  PERSONAL_TM_ATTACHMENT_ID,
  TM_ATTACHMENT_CATALOG,
} from '@/tm/projectAttachments'
import type { JobRole } from '@/types/job'
import type { ProjectTmAttachmentId } from '@/types/project'

const props = defineProps<{
  jobId: string
  isOwner: boolean
  myRole: JobRole | null
}>()

const { t } = useI18n()
const attachments = ref(listJobTmAttachments(props.jobId))
const collectionOpen = ref(false)
const collectionMode = ref<'pick' | 'browse'>('pick')
const collectionReturnTo = ref<'job' | null>(null)
const attachedIds = computed(() => attachments.value.map(item => item.id))

watch(
  () => props.jobId,
  jobId => {
    attachments.value = listJobTmAttachments(jobId)
  }
)

function catalogItem(id: ProjectTmAttachmentId) {
  return TM_ATTACHMENT_CATALOG.find(item => item.id === id)
}

function itemLabel(id: ProjectTmAttachmentId) {
  const item = catalogItem(id)
  return id === PERSONAL_TM_ATTACHMENT_ID ? t('projects.tmPersonalBase') : (item?.label ?? id)
}

function openPick() {
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

function attach(id: ProjectTmAttachmentId) {
  attachments.value = attachJobTm(props.jobId, id)
  closeCollection()
}

function detach(id: ProjectTmAttachmentId) {
  attachments.value = detachJobTm(props.jobId, id)
}

function togglePermission(
  id: ProjectTmAttachmentId,
  permission: 'canRead' | 'canWrite',
  value: boolean
) {
  attachments.value = updateJobTmAttachment(props.jobId, id, { [permission]: value })
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

    <div class="attachments">
      <div class="attachments-header">
        <strong class="attachments-title">{{ t('jobs.memoriesAttachedTitle') }}</strong>
        <button
          type="button"
          class="add"
          data-testid="job-tm-add"
          :aria-label="t('jobs.memoriesAttach')"
          :title="t('jobs.memoriesAttach')"
          @click="openPick"
        >
          <EditorGlyph name="plus" />
        </button>
      </div>

      <p v-if="attachments.length === 0" class="muted">
        {{ t('jobs.memoriesAttachedEmpty') }}
      </p>

      <div v-else class="bases">
        <article v-for="attachment in attachments" :key="attachment.id" class="base-card">
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
              type="checkbox"
              :checked="attachment.canRead"
              @change="
                togglePermission(
                  attachment.id,
                  'canRead',
                  ($event.target as HTMLInputElement).checked
                )
              "
            />
          </label>
          <label class="permission" :title="t('projects.tmPermWrite')">
            <span>{{ t('projects.tmPermWriteShort') }}</span>
            <input
              type="checkbox"
              :checked="attachment.canWrite"
              @change="
                togglePermission(
                  attachment.id,
                  'canWrite',
                  ($event.target as HTMLInputElement).checked
                )
              "
            />
          </label>
          <button
            type="button"
            class="detach"
            :aria-label="t('jobs.memoriesDetach')"
            :title="t('jobs.memoriesDetach')"
            @click="detach(attachment.id)"
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

.muted {
  margin: 0.2rem 0 0;
  line-height: 1.4;
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
