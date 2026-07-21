<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { publicActorLabel, useAuth } from '@/auth/session'
import IconButton from '@/components/IconButton.vue'
import EditorGlyph from '@/components/EditorGlyph.vue'
import LangPairBadge from '@/components/LangPairBadge.vue'
import MarqueeText from '@/components/MarqueeText.vue'
import ProjectListItem from '@/components/ProjectListItem.vue'
import JobTmBasesDialog from '@/components/JobTmBasesDialog.vue'
import SharedWorkPanel from '@/components/SharedWorkPanel.vue'
import TmAttachmentStrip from '@/components/TmAttachmentStrip.vue'
import TmCollectionDialog from '@/components/TmCollectionDialog.vue'
import { openDocx } from '@/docx/openDocx'
import { createEmptyJobProject } from '@/jobs/createProject'
import { fingerprintMismatch } from '@/jobs/fingerprint'
import { bindProjectToJob, projectFingerprint, unlinkLocalProjectsFromJob } from '@/jobs/localProject'
import { getJob, listMembers, deleteJob, archiveJob, leaveJob, patchJob } from '@/jobs/api'
import {
  createJobTmAttachment,
  listJobTmAttachmentsApi,
} from '@/jobs/tmAttachmentsApi'
import { saveJobLangPairFromCodes } from '@/jobs/langPairPreference'
import { createProjectId, getProject, listProjects, saveProject } from '@/storage/idb'
import { getPersonalTmStats } from '@/storage/tmIdb'
import { langPairLabel } from '@/tm/langPairs'
import { PERSONAL_TM_ATTACHMENT_ID } from '@/tm/projectAttachments'
import { unpackProjectFile } from '@/storage/projectFile'
import { SEGMENT_SCHEMA_DATE_SAFE, type ProjectMeta, type ProjectRecord, type ProjectTmAttachmentId } from '@/types/project'
import { acknowledgeJobJoins } from '@/jobs/joinActivity'
import { progressPercent } from '@/jobs/progress'
import {
  computeLocalJobProgress,
  reportJobMemberProgress,
} from '@/jobs/reportProgress'
import type { Job, JobMember, JobTmAttachment } from '@/types/job'

const props = defineProps<{
  jobId: string
}>()

const emit = defineEmits<{
  close: []
  changed: []
  notice: [message: string]
  error: [message: string]
}>()

const { t } = useI18n()
const { user } = useAuth()

const job = ref<Job | null>(null)
const members = ref<JobMember[]>([])
const projects = ref<ProjectMeta[]>([])
const selectedId = ref('')
const docxInput = ref<HTMLInputElement | null>(null)
const projectInput = ref<HTMLInputElement | null>(null)
const panelOpen = ref(false)
const busy = ref(false)
const error = ref('')
const pendingAction = ref<'leave' | 'archive' | 'delete' | null>(null)
const pendingProject = ref<ProjectRecord | null>(null)
const mismatchOpen = ref(false)
/** Live local progress for current user (overrides stale server roster). */
const myLiveProgress = ref<{
  progressDone: number
  progressTotal: number
  progressTm: number
} | null>(null)

const jobTmAttachments = ref<JobTmAttachment[]>([])
const jobTmBasesOpen = ref(false)
const jobTmCollectionOpen = ref(false)
const jobTmCollectionMode = ref<'pick' | 'browse'>('pick')
const jobTmCollectionReturnTo = ref<'job' | null>(null)
const personalTmCount = ref(0)
const personalTmUpdatedAt = ref<string | null>(null)

const myMember = computed(() => members.value.find(member => member.userId === user.value?.id))
const isOwner = computed(() => job.value?.ownerUserId === user.value?.id)
const isArchived = computed(() => Boolean(job.value?.archivedAt))
const canHaveProject = computed(
  () => myMember.value?.role === 'owner' || myMember.value?.role === 'translator',
)
const linkedProject = computed(() => {
  const localId = myMember.value?.localProjectId
  return projects.value.find(project => project.id === localId || project.jobId === props.jobId)
})

const jobTmStripItems = computed(() =>
  jobTmAttachments.value.map(item => ({
    id: item.tmBaseId,
    canRead: item.canRead,
    canWrite: item.canWrite,
  })),
)
const jobTmAttachedIds = computed(() =>
  jobTmAttachments.value.map(item => item.tmBaseId as ProjectTmAttachmentId),
)
const jobLangPairText = computed(() => {
  const j = job.value
  if (!j?.sourceLang && !j?.targetLang) return ''
  return langPairLabel(j?.sourceLang, j?.targetLang)
})

const displayMembers = computed(() =>
  members.value.map(member => {
    if (!myLiveProgress.value || member.userId !== user.value?.id) return member
    return { ...member, ...myLiveProgress.value }
  }),
)

watch(
  () => props.jobId,
  () => {
    void load()
  },
  { immediate: true },
)

function onWindowFocus() {
  void load()
  emit('changed')
}

onMounted(() => {
  window.addEventListener('focus', onWindowFocus)
})

onUnmounted(() => {
  window.removeEventListener('focus', onWindowFocus)
})

async function load() {
  if (!props.jobId) return
  busy.value = true
  error.value = ''
  job.value = null
  myLiveProgress.value = null
  jobTmAttachments.value = []
  try {
    const [nextJob, nextMembers, nextProjects] = await Promise.all([
      getJob(props.jobId),
      listMembers(props.jobId),
      listProjects(),
    ])
    job.value = nextJob
    members.value = nextMembers
    projects.value = nextProjects
    if (user.value?.id && nextJob.ownerUserId === user.value.id) {
      acknowledgeJobJoins(user.value.id, nextJob.id, nextMembers)
    }
    await Promise.all([syncMyProgressFromLocal(), refreshJobTmAttachments()])
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function refreshJobTmAttachments() {
  if (!props.jobId) return
  try {
    jobTmAttachments.value = await listJobTmAttachmentsApi(props.jobId)
    await refreshPersonalTmStatsForStrip()
  } catch (err) {
    jobTmAttachments.value = []
    // Non-fatal for hub; surface message but keep card usable.
    error.value = err instanceof Error ? err.message : String(err)
  }
}

async function refreshPersonalTmStatsForStrip() {
  if (!jobTmAttachments.value.some(item => item.tmBaseId === PERSONAL_TM_ATTACHMENT_ID)) {
    personalTmCount.value = 0
    personalTmUpdatedAt.value = null
    return
  }
  try {
    const stats = await getPersonalTmStats()
    personalTmCount.value = stats.count
    personalTmUpdatedAt.value = stats.lastUpdatedAt
  } catch {
    personalTmCount.value = 0
    personalTmUpdatedAt.value = null
  }
}

function openJobTmBases() {
  if (!isOwner.value) return
  if (jobTmAttachments.value.length === 0) {
    openJobTmPick()
    return
  }
  jobTmBasesOpen.value = true
}

function openJobTmPick() {
  jobTmBasesOpen.value = false
  jobTmCollectionMode.value = 'pick'
  jobTmCollectionReturnTo.value = 'job'
  jobTmCollectionOpen.value = true
}

function openJobTmFullFromPick() {
  jobTmCollectionMode.value = 'browse'
  jobTmCollectionReturnTo.value = 'job'
}

function onJobTmCollectionClose() {
  jobTmCollectionOpen.value = false
  if (jobTmCollectionReturnTo.value === 'job' && jobTmAttachments.value.length > 0) {
    jobTmBasesOpen.value = true
  }
  jobTmCollectionReturnTo.value = null
}

async function onJobTmAttach(id: ProjectTmAttachmentId) {
  if (!isOwner.value) return
  try {
    await createJobTmAttachment(props.jobId, {
      tmBaseId: id,
      canRead: true,
      canWrite: true,
    })
    await refreshJobTmAttachments()
    jobTmCollectionOpen.value = false
    jobTmCollectionReturnTo.value = null
    jobTmBasesOpen.value = true
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

async function syncMyProgressFromLocal() {
  if (!job.value || !canHaveProject.value) return
  const localId =
    myMember.value?.localProjectId ||
    projects.value.find(project => project.jobId === props.jobId)?.id
  if (!localId) return
  const record = await getProject(localId)
  if (!record) return

  const progress = await computeLocalJobProgress(record)
  myLiveProgress.value = progress

  const updated = await reportJobMemberProgress(job.value.id, record)
  if (updated) {
    members.value = members.value.map(member =>
      member.userId === updated.userId ? updated : member,
    )
    myLiveProgress.value = {
      progressDone: updated.progressDone,
      progressTotal: updated.progressTotal,
      progressTm: updated.progressTm ?? progress.progressTm,
    }
  }
}

function closePanel() {
  panelOpen.value = false
  void load()
  emit('changed')
}

async function confirmPendingAction() {
  if (!job.value || !pendingAction.value || busy.value) return
  const kind = pendingAction.value
  if (kind === 'leave' && isOwner.value) return
  if ((kind === 'archive' || kind === 'delete') && !isOwner.value) return
  busy.value = true
  error.value = ''
  try {
    if (kind === 'leave') {
      await leaveJob(job.value.id)
      await unlinkLocalProjectsFromJob(job.value.id, projects.value)
      pendingAction.value = null
      emit('changed')
      emit('close')
      return
    }
    if (kind === 'archive') {
      job.value = await archiveJob(job.value.id)
      pendingAction.value = null
      emit('changed')
      return
    }
    await deleteJob(job.value.id)
    await unlinkLocalProjectsFromJob(job.value.id, projects.value)
    pendingAction.value = null
    emit('changed')
    emit('close')
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function onProjectChanged() {
  await load()
  emit('changed')
}

function memberName(member: JobMember) {
  if (user.value?.id && member.userId === user.value.id) {
    return publicActorLabel(user.value) || member.displayName?.trim() || `anon:${member.userId}`
  }
  return member.displayName?.trim() || `anon:${member.userId}`
}

function roleLabel(role: JobMember['role']) {
  return t(`jobs.roles.${role}`)
}

function memberPct(member: JobMember) {
  return progressPercent(member.progressDone, member.progressTotal)
}

function memberTmPct(member: JobMember) {
  return progressPercent(member.progressTm ?? 0, member.progressTotal)
}

async function bind(record: ProjectRecord) {
  if (!job.value) return
  const linked = bindProjectToJob(record, job.value)
  await saveProject(linked)
  await reportJobMemberProgress(job.value.id, linked)
  mismatchOpen.value = false
  pendingProject.value = null
  await load()
  emit('changed')
}

async function bindWithWarning(record: ProjectRecord) {
  if (!job.value) return
  const fingerprint = await projectFingerprint(record)
  if (fingerprintMismatch(job.value, fingerprint)) {
    pendingProject.value = record
    mismatchOpen.value = true
    return
  }
  await bind(record)
}

async function bindSelected() {
  if (!selectedId.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const record = await getProject(selectedId.value)
    if (!record) throw new Error(t('jobs.localProjectMissing'))
    await bindWithWarning(record)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function onDocxSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !job.value) return
  busy.value = true
  error.value = ''
  try {
    const opened = await openDocx(file)
    const now = new Date().toISOString()
    const record: ProjectRecord = {
      meta: {
        id: createProjectId(),
        name: file.name.replace(/\.docx$/i, '') || job.value.title,
        createdAt: now,
        updatedAt: now,
        sourceLang: job.value.sourceLang || undefined,
        targetLang: job.value.targetLang || undefined,
        segmentSchemaVersion: SEGMENT_SCHEMA_DATE_SAFE,
        segmentCount: opened.segments.length,
        doneCount: 0,
        jobId: job.value.id,
        sourceFilename: file.name,
      },
      segments: opened.segments,
      docx: opened.zipBytes,
    }
    await bindWithWarning(record)
    if (!opened.segments.length) {
      sessionStorage.setItem(`tr.emptyDocNotice:${record.meta.id}`, '1')
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function createEmpty() {
  if (!job.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    await bind(await createEmptyJobProject(job.value, createProjectId()))
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function onProjectFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  busy.value = true
  error.value = ''
  try {
    await bindWithWarning(await unpackProjectFile(file))
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function onLangPairChange(payload: { sourceLang: string; targetLang: string }) {
  if (!job.value || busy.value || isArchived.value || !isOwner.value) return
  busy.value = true
  error.value = ''
  try {
    job.value = await patchJob(job.value.id, payload)
    saveJobLangPairFromCodes(payload.sourceLang, payload.targetLang)
    emit('changed')
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="job-hub">
    <button type="button" class="back" @click="emit('close')">
      ← {{ t('jobs.backToSharedList') }}
    </button>

    <header class="hub-head">
      <h3 class="hub-title">
        <span>{{ job?.title || t('jobs.panelTitle') }}</span>
        <LangPairBadge
          v-if="job && (jobLangPairText || isOwner)"
          :source-lang="job.sourceLang"
          :target-lang="job.targetLang"
          :editable="isOwner && !isArchived"
          :disabled="busy"
          @change="onLangPairChange"
        />
        <span v-if="isArchived" class="archived-chip">{{ t('jobs.archivedBadge') }}</span>
        <IconButton
          v-if="job"
          :title="t('jobs.manageWork')"
          :disabled="busy || isArchived"
          @click="panelOpen = true"
        >
          <EditorGlyph name="user-plus" />
        </IconButton>
      </h3>
      <div v-if="job" class="hub-actions">
        <template v-if="pendingAction">
          <IconButton
            danger
            :title="
              pendingAction === 'leave'
                ? t('jobs.confirmLeave', { name: job.title })
                : pendingAction === 'archive'
                  ? t('jobs.confirmArchive', { name: job.title })
                  : t('jobs.confirmDeleteForever', { name: job.title })
            "
            :disabled="busy"
            @click="confirmPendingAction"
          >
            <EditorGlyph name="check" />
          </IconButton>
          <IconButton
            :title="t('jobs.deleteCancel')"
            :disabled="busy"
            @click="pendingAction = null"
          >
            <EditorGlyph name="close" />
          </IconButton>
        </template>
        <template v-else-if="isOwner">
          <IconButton
            v-if="!isArchived"
            :title="t('jobs.archive')"
            :disabled="busy"
            @click="pendingAction = 'archive'"
          >
            <EditorGlyph name="archive" />
          </IconButton>
          <IconButton
            danger
            :title="t('jobs.deleteForever')"
            :disabled="busy"
            @click="pendingAction = 'delete'"
          >
            <EditorGlyph name="trash" />
          </IconButton>
        </template>
        <IconButton
          v-else
          :title="t('jobs.leave')"
          :disabled="busy"
          @click="pendingAction = 'leave'"
        >
          <EditorGlyph name="leave" />
        </IconButton>
      </div>
    </header>

    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="busy && !job" class="muted">{{ t('jobs.loading') }}</p>

    <ul v-if="job" class="members">
      <li v-for="member in displayMembers" :key="member.userId" class="member-row">
        <MarqueeText class="member-name" :text="memberName(member)" max-width="100%" />
        <div class="role-cell">
          <span class="role-chip" :data-role="member.role">{{ roleLabel(member.role) }}</span>
          <span
            v-if="member.partDone"
            class="part-done"
            :title="t('jobs.partDoneColumn')"
          >
            {{ t('jobs.partDoneYes') }}
          </span>
        </div>
        <span class="progress-tm">
          {{
            t('jobs.progressTmDetail', {
              hits: member.progressTm ?? 0,
              total: member.progressTotal,
              pct: memberTmPct(member),
            })
          }}
        </span>
        <span class="progress-count">
          {{
            t('jobs.progressConfirmed', {
              done: member.progressDone,
              total: member.progressTotal,
              pct: memberPct(member),
            })
          }}
        </span>
        <div
          class="progress-track"
          role="progressbar"
          :aria-valuenow="memberPct(member)"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-label="t('jobs.progressPct', { pct: memberPct(member) })"
        >
          <div class="progress-fill" :style="{ width: `${memberPct(member)}%` }" />
        </div>
      </li>
    </ul>

    <template v-if="job && canHaveProject">
      <ul v-if="linkedProject" class="list">
        <ProjectListItem
          :project="linkedProject"
          :job-id="jobId"
          :source-lang="job?.sourceLang"
          :target-lang="job?.targetLang"
          glow
          @changed="onProjectChanged"
          @notice="emit('notice', $event)"
          @error="emit('error', $event)"
        />
      </ul>
      <section v-else class="hub-card" data-testid="job-hub-unbound">
        <TmAttachmentStrip
          class="job-hub-tm-strip"
          data-testid="job-hub-tm-strip"
          :items="jobTmStripItems"
          :show-add="isOwner"
          :busy="busy"
          :personal-unit-count="personalTmCount"
          :personal-last-updated-at="personalTmUpdatedAt"
          @add="openJobTmBases"
        />
        <p class="muted">
          {{ t('jobs.noLinkedProject') }}
          <template v-if="jobLangPairText">
            · {{ jobLangPairText }}
          </template>
        </p>
        <div class="project-actions">
          <button type="button" class="primary" :disabled="busy" @click="docxInput?.click()">
            {{ t('jobs.createFromDocx') }}
          </button>
          <button type="button" :disabled="busy" @click="createEmpty">
            {{ t('jobs.createEmpty') }}
          </button>
          <button type="button" :disabled="busy" @click="projectInput?.click()">
            {{ t('jobs.importProject') }}
          </button>
        </div>
        <div v-if="projects.length" class="bind-row">
          <select v-model="selectedId" :disabled="busy">
            <option value="">{{ t('jobs.chooseLocalProject') }}</option>
            <option v-for="project in projects" :key="project.id" :value="project.id">
              {{ project.name }}
            </option>
          </select>
          <button type="button" :disabled="busy || !selectedId" @click="bindSelected">
            {{ t('jobs.bindProject') }}
          </button>
        </div>
      </section>
      <JobTmBasesDialog
        :open="jobTmBasesOpen"
        :job-id="jobId"
        :attachments="jobTmAttachments"
        :is-owner="Boolean(isOwner)"
        @close="jobTmBasesOpen = false"
        @changed="refreshJobTmAttachments"
        @error="error = $event"
        @open-pick="openJobTmPick"
      />
      <TmCollectionDialog
        :open="jobTmCollectionOpen"
        :mode="jobTmCollectionMode"
        :return-to="jobTmCollectionReturnTo"
        :attached-ids="jobTmAttachedIds"
        :context-label="job?.title || jobId"
        @close="onJobTmCollectionClose"
        @attach="onJobTmAttach"
        @deleted="refreshJobTmAttachments"
        @open-full="openJobTmFullFromPick"
        @error="error = $event"
      />
      <input
        ref="docxInput"
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        hidden
        @change="onDocxSelected"
      />
      <input
        ref="projectInput"
        type="file"
        accept=".zip,.tcat.zip,application/zip"
        hidden
        @change="onProjectFileSelected"
      />
    </template>

    <section v-else-if="job" class="hub-card">
      <h4>{{ t('jobs.viewerHubTitle') }}</h4>
      <p class="muted">{{ t('jobs.viewerHubHint') }}</p>
    </section>

    <SharedWorkPanel
      v-if="panelOpen"
      :open="panelOpen"
      :job-id="jobId"
      @close="closePanel"
    />

    <div v-if="mismatchOpen" class="modal-backdrop">
      <div class="modal" role="alertdialog" aria-modal="true">
        <h4>{{ t('jobs.mismatchTitle') }}</h4>
        <p>{{ t('jobs.mismatchHint') }}</p>
        <div class="project-actions">
          <button type="button" @click="mismatchOpen = false">
            {{ t('jobs.mismatchCancel') }}
          </button>
          <button
            type="button"
            class="primary"
            :disabled="busy"
            @click="pendingProject && bind(pendingProject)"
          >
            {{ t('jobs.mismatchContinue') }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.job-hub {
  margin-top: 0.55rem;
  color: var(--text);
}

.back {
  display: inline-block;
  margin: 0 0 0.35rem;
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
  text-align: left;
}

.hub-head,
.project-actions,
.bind-row {
  display: flex;
  align-items: center;
}

.hub-head {
  margin: 0 0 0.45rem;
  justify-content: space-between;
  gap: 0.5rem;
}

.hub-actions {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  flex-shrink: 0;
}

.hub-title {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
}

.archived-chip {
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--text-muted);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.05rem 0.4rem;
}

.hub-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem 0.45rem;
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1.25;
}

h4,
.muted {
  margin: 0;
}

h4 {
  margin-bottom: 0.35rem;
  font-size: 0.8rem;
  font-weight: 650;
}

.muted,
small {
  color: var(--text-muted);
  font-size: 0.78rem;
}

.list {
  list-style: none;
  padding: 0;
  margin: 1rem 0 0;
}

.hub-card {
  margin-top: 1rem;
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-soft);
}

.job-hub-tm-strip {
  :deep(.tm-strip) {
    max-width: 100%;
    flex: 1 1 auto;
  }
}

.members {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  margin: 0.45rem 0 0;
  padding: 0;
  list-style: none;
}

.member-row {
  display: grid;
  grid-template-columns: minmax(0, 35%) minmax(0, 0.85fr) minmax(0, 1.3fr) minmax(0, 1.3fr);
  align-items: center;
  column-gap: 0.45rem;
  row-gap: 0.28rem;
  min-width: 0;
}

.member-name {
  grid-column: 1;
  min-width: 0;
  font-weight: 600;
  color: var(--text);
}

.role-cell {
  grid-column: 2;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 0.25rem 0.35rem;
  min-width: 0;
  overflow: hidden;
}

.role-chip {
  display: inline-flex;
  align-items: center;
  font-size: 0.68rem;
  font-weight: 650;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.progress-tm {
  grid-column: 3;
  min-width: 0;
  text-align: left;
  color: color-mix(in srgb, var(--accent) 40%, var(--text-muted));
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.progress-count {
  grid-column: 4;
  min-width: 0;
  text-align: left;
  color: var(--accent);
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.progress-track {
  grid-column: 1 / -1;
  width: 100%;
  height: 0.4rem;
  min-height: 0.4rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text-muted) 14%, var(--surface));
  overflow: hidden;
}

.part-done {
  color: var(--ok);
  font-size: 0.68rem;
  font-weight: 650;
  white-space: nowrap;
  flex: 0 0 auto;
}

.role-chip[data-role='owner'] {
  color: var(--accent);
}

.role-chip[data-role='translator'] {
  color: var(--ok);
}

.role-chip[data-role='viewer'] {
  color: #b8921f;
}

.progress-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--accent);
  transition: width 0.2s ease;
}

.project-actions,
.bind-row {
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.4rem;
}

button:not(.back):not(.icon-btn),
select {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.28rem 0.55rem;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.8rem;
}

button:not(.back):not(.icon-btn) {
  cursor: pointer;
}

.primary {
  border-color: var(--accent-strong);
  background: var(--accent-strong);
  color: var(--accent-text);
}

.bind-row select {
  min-width: 10rem;
}

.error {
  margin: 0.3rem 0;
  color: var(--danger);
  font-size: 0.8rem;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: color-mix(in srgb, #000 48%, transparent);
}

.modal {
  width: min(26rem, 100%);
  padding: 0.85rem 1rem;
  border-radius: 10px;
  background: var(--surface);
}
</style>
