<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { openDocx, DocxError } from '@/docx/openDocx'
import {
  createProjectId,
  listProjects,
  saveProject,
} from '@/storage/idb'
import { unpackProjectFile } from '@/storage/projectFile'
import { SEGMENT_SCHEMA_DATE_SAFE } from '@/types/project'
import JobHubInline from '@/components/JobHubInline.vue'
import ProjectListItem from '@/components/ProjectListItem.vue'
import CreateSharedWorkDialog from '@/components/CreateSharedWorkDialog.vue'
import IconButton from '@/components/IconButton.vue'
import EditorGlyph from '@/components/EditorGlyph.vue'
import { useAuth } from '@/auth/session'
import { listJobs, deleteJob, archiveJob, leaveJob } from '@/jobs/api'
import { parseJobInviteToken } from '@/jobs/inviteToken'
import { unlinkLocalProjectsFromJob } from '@/jobs/localProject'
import {
  joinUnreadCount,
  jobHasJoinUnread,
  startJoinActivityPolling,
  stopJoinActivityPolling,
} from '@/jobs/joinActivity'
import { langPairLabel } from '@/tm/langPairs'
import type { Job } from '@/types/job'
import type { ProjectMeta } from '@/types/project'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { user } = useAuth()

const projects = ref<ProjectMeta[]>([])
const sharedJobs = ref<Job[]>([])
const error = ref('')
const notice = ref('')
const busy = ref(false)
const docxInput = ref<HTMLInputElement | null>(null)
const projectInput = ref<HTMLInputElement | null>(null)
const inviteInput = ref('')
const inviteError = ref('')
const openJobId = ref('')
const hoverJobId = ref('')
const pendingJobAction = ref<{
  jobId: string
  kind: 'leave' | 'archive' | 'delete'
} | null>(null)
const actionBusy = ref(false)
const createSharedOpen = ref(false)

const sectionUnread = computed(() => joinUnreadCount.value)
const relatedJobId = computed(() => hoverJobId.value || openJobId.value)

function isRelatedProject(project: ProjectMeta) {
  return Boolean(relatedJobId.value && project.jobId === relatedJobId.value)
}

function isJobOwner(job: Job) {
  return Boolean(user.value?.id && job.ownerUserId === user.value.id)
}

function isJobArchived(job: Job) {
  return Boolean(job.archivedAt)
}

function cancelJobAction() {
  pendingJobAction.value = null
}

async function confirmJobAction(job: Job) {
  const pending = pendingJobAction.value
  if (!pending || pending.jobId !== job.id || actionBusy.value) return
  actionBusy.value = true
  error.value = ''
  notice.value = ''
  try {
    if (pending.kind === 'leave') {
      await leaveJob(job.id)
      await unlinkLocalProjectsFromJob(job.id, projects.value)
      notice.value = t('jobs.leftNotice', { name: job.title })
    } else if (pending.kind === 'archive') {
      await archiveJob(job.id)
      notice.value = t('jobs.archivedNotice', { name: job.title })
    } else {
      await deleteJob(job.id)
      await unlinkLocalProjectsFromJob(job.id, projects.value)
      notice.value = t('jobs.deletedNotice', { name: job.title })
    }
    if (openJobId.value === job.id && pending.kind !== 'archive') closeJob()
    pendingJobAction.value = null
    await refresh()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    actionBusy.value = false
  }
}

function openJob(jobId: string) {
  openJobId.value = jobId
  void router.replace({ name: 'projects', query: { ...route.query, job: jobId } })
}

async function onSharedWorkCreated(job: Job) {
  createSharedOpen.value = false
  notice.value = ''
  await refresh()
  openJob(job.id)
}

function closeJob() {
  openJobId.value = ''
  const query = { ...route.query }
  delete query.job
  void router.replace({ name: 'projects', query })
}

watch(
  () => route.query.job,
  job => {
    openJobId.value = typeof job === 'string' ? job : ''
  },
  { immediate: true },
)

async function refresh() {
  projects.value = await listProjects()
  sharedJobs.value = []
  if (!user.value?.id) {
    stopJoinActivityPolling()
    return
  }
  try {
    sharedJobs.value = await listJobs()
    startJoinActivityPolling(user.value.id, () => sharedJobs.value)
  } catch {
    // Local projects remain available while shared-work cards are offline.
    stopJoinActivityPolling()
  }
}

watch(() => user.value?.id, refresh, { immediate: true })
onUnmounted(stopJoinActivityPolling)

async function onDocxSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const opened = await openDocx(file)
    const now = new Date().toISOString()
    const id = createProjectId()
    const name = file.name.replace(/\.docx$/i, '') || 'Untitled'
    await saveProject({
      meta: {
        id,
        name,
        createdAt: now,
        updatedAt: now,
        segmentCount: opened.segments.length,
        doneCount: 0,
        segmentSchemaVersion: SEGMENT_SCHEMA_DATE_SAFE,
      },
      segments: opened.segments,
      docx: opened.zipBytes,
    })
    if (!opened.segments.length) {
      sessionStorage.setItem(`tr.emptyDocNotice:${id}`, '1')
    }
    await router.push({ name: 'editor', params: { id } })
  } catch (err) {
    error.value = err instanceof DocxError || err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function onProjectFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const record = await unpackProjectFile(file)
    await saveProject(record)
    if (!record.segments.length) {
      sessionStorage.setItem(`tr.emptyDocNotice:${record.meta.id}`, '1')
    }
    await router.push({ name: 'editor', params: { id: record.meta.id } })
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

function onItemNotice(message: string) {
  notice.value = message
  if (message) error.value = ''
}

function onItemError(message: string) {
  error.value = message
  if (message) notice.value = ''
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function jobLangPairText(job: Job) {
  if (!job.sourceLang && !job.targetLang) return ''
  return langPairLabel(job.sourceLang, job.targetLang)
}

async function openInvite() {
  const token = parseJobInviteToken(inviteInput.value)
  if (!token) {
    inviteError.value = t('jobs.invitePasteInvalid')
    return
  }
  inviteError.value = ''
  await router.push({ name: 'job-invite', params: { token } })
}
</script>

<template>
  <section class="projects-page">
    <div class="head">
      <h1>{{ t('projects.title') }}</h1>
      <div class="actions">
        <form class="invite-paste" @submit.prevent="openInvite">
          <input
            v-model="inviteInput"
            type="text"
            :placeholder="t('jobs.invitePastePlaceholder')"
            :aria-label="t('jobs.invitePasteAction')"
          />
          <button type="submit" :disabled="!inviteInput.trim()">
            {{ t('jobs.invitePasteAction') }}
          </button>
        </form>
        <button type="button" class="primary" :disabled="busy" @click="docxInput?.click()">
          {{ t('projects.newFromDocx') }}
        </button>
        <button type="button" :disabled="busy" @click="projectInput?.click()">
          {{ t('projects.openProjectFile') }}
        </button>
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
      </div>
    </div>

    <p v-if="error" class="error">{{ t('projects.errorGeneric', { message: error }) }}</p>
    <p v-else-if="inviteError" class="error">{{ inviteError }}</p>
    <p v-else-if="notice" class="notice">{{ notice }}</p>

    <div class="columns">
      <section class="column" aria-labelledby="personal-projects-title">
        <h2 id="personal-projects-title" class="block-title">
          {{ t('projects.personalProjectsTitle') }}
        </h2>
        <ul v-if="projects.length" class="list">
          <ProjectListItem
            v-for="p in projects"
            :key="p.id"
            :project="p"
            :glow="isRelatedProject(p)"
            @changed="refresh"
            @notice="onItemNotice"
            @error="onItemError"
          />
        </ul>
        <p v-else-if="!busy" class="empty">{{ t('projects.empty') }}</p>
      </section>

      <section class="column" aria-labelledby="shared-works-title">
        <h2 id="shared-works-title" class="block-title">
          {{ t('projects.sharedWorksTitle') }}
          <span
            v-if="sectionUnread && !openJobId"
            class="section-badge"
            :title="t('jobs.joinUnreadHint')"
            :aria-label="t('jobs.joinUnreadHint')"
          >
            {{ sectionUnread }}
          </span>
          <IconButton
            v-if="!openJobId"
            class="create-shared"
            :title="t('jobs.createFromListHint')"
            @click="createSharedOpen = true"
          >
            <EditorGlyph name="plus" />
          </IconButton>
        </h2>

        <JobHubInline
          v-if="openJobId"
          :job-id="openJobId"
          @close="closeJob"
          @changed="refresh"
          @notice="onItemNotice"
          @error="onItemError"
        />

        <template v-else>
          <ul v-if="sharedJobs.length" class="list">
            <li
              v-for="job in sharedJobs"
              :key="job.id"
              class="item viewer-item"
              :class="{ 'has-join-unread': jobHasJoinUnread(job.id) }"
              @mouseenter="hoverJobId = job.id"
              @mouseleave="hoverJobId = ''"
            >
              <button type="button" class="viewer-card" @click="openJob(job.id)">
                <span class="name">
                  {{ job.title }}
                  <span
                    v-if="isJobArchived(job)"
                    class="archived-chip"
                  >{{ t('jobs.archivedBadge') }}</span>
                  <span
                    v-if="jobHasJoinUnread(job.id)"
                    class="join-dot"
                    :title="t('jobs.joinUnreadHint')"
                    aria-hidden="true"
                  />
                </span>
                <span class="sub">
                  <template v-if="jobLangPairText(job)">{{ jobLangPairText(job) }} · </template>
                  {{ t('projects.updated', { date: formatDate(job.updatedAt) }) }}
                </span>
              </button>
              <div class="item-actions">
                <template
                  v-if="pendingJobAction && pendingJobAction.jobId === job.id"
                >
                  <IconButton
                    danger
                    :title="
                      pendingJobAction.kind === 'leave'
                        ? t('jobs.confirmLeave', { name: job.title })
                        : pendingJobAction.kind === 'archive'
                          ? t('jobs.confirmArchive', { name: job.title })
                          : t('jobs.confirmDeleteForever', { name: job.title })
                    "
                    :disabled="actionBusy"
                    @click="confirmJobAction(job)"
                  >
                    <EditorGlyph name="check" />
                  </IconButton>
                  <IconButton
                    :title="t('jobs.deleteCancel')"
                    :disabled="actionBusy"
                    @click="cancelJobAction"
                  >
                    <EditorGlyph name="close" />
                  </IconButton>
                </template>
                <template v-else-if="isJobOwner(job)">
                  <IconButton
                    v-if="!isJobArchived(job)"
                    :title="t('jobs.archive')"
                    :disabled="actionBusy"
                    @click="pendingJobAction = { jobId: job.id, kind: 'archive' }"
                  >
                    <EditorGlyph name="archive" />
                  </IconButton>
                  <IconButton
                    danger
                    :title="t('jobs.deleteForever')"
                    :disabled="actionBusy"
                    @click="pendingJobAction = { jobId: job.id, kind: 'delete' }"
                  >
                    <EditorGlyph name="trash" />
                  </IconButton>
                </template>
                <IconButton
                  v-else
                  :title="t('jobs.leave')"
                  :disabled="actionBusy"
                  @click="pendingJobAction = { jobId: job.id, kind: 'leave' }"
                >
                  <EditorGlyph name="leave" />
                </IconButton>
              </div>
            </li>
          </ul>
          <p v-else-if="!busy" class="empty">{{ t('projects.noSharedWorks') }}</p>
        </template>
      </section>
    </div>

    <CreateSharedWorkDialog
      :open="createSharedOpen"
      @close="createSharedOpen = false"
      @created="onSharedWorkCreated"
    />
  </section>
</template>

<style scoped lang="scss">
.projects-page {
  padding-top: clamp(1.1rem, 2.5vw, 1.65rem);
}

.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.25rem;
}

h1 {
  margin: 0;
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--text);
}

.block-title {
  margin: 0;
  color: var(--text);
  font-size: 1.15rem;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
}

.columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 1.25rem 1.75rem;
  align-items: start;
  margin-top: 0.35rem;
}

.column {
  min-width: 0;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.invite-paste {
  display: flex;
  gap: 0.35rem;
}

.invite-paste input {
  width: min(17rem, 42vw);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.45rem 0.65rem;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.85rem;
}

button {
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 8px;
  padding: 0.45rem 0.85rem;
  cursor: pointer;
  text-decoration: none;
  color: var(--text);
  font-size: 0.9rem;
}

button.primary {
  background: var(--accent-strong);
  color: var(--accent-text);
  border-color: var(--accent-strong);
}

.error {
  color: var(--danger);
  background: var(--danger-bg);
  padding: 0.65rem 0.85rem;
  border-radius: 8px;
}

.notice {
  color: var(--ok);
  font-size: 0.9rem;
}

.empty {
  color: var(--text-muted);
}

.section-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.15rem;
  height: 1.15rem;
  padding: 0 0.35rem;
  border-radius: 999px;
  background: #e05555;
  color: #fff;
  font-size: 0.68rem;
  font-weight: 700;
  line-height: 1;
}

.list {
  list-style: none;
  padding: 0;
  margin: 1rem 0 0;
}

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
    border-color 0.15s ease;
}

.item:hover {
  background: var(--surface);
  border-color: var(--border-strong);
}

.item.has-join-unread {
  border-color: color-mix(in srgb, #e05555 45%, var(--border));
}

.viewer-card {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  align-items: flex-start;
  text-align: left;
  border: 0;
  background: transparent;
  padding: 0.2rem 0.3rem;
  cursor: pointer;
  color: inherit;
  font: inherit;
  width: 100%;
  text-decoration: none;
}

.item-actions {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  flex-shrink: 0;
}

.name {
  font-weight: 600;
  color: var(--text);
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.join-dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: #e05555;
  flex: 0 0 auto;
}

.archived-chip {
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--text-muted);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.05rem 0.4rem;
}

.sub {
  font-size: 0.85rem;
  color: var(--text-muted);
}

@media (max-width: 860px) {
  .columns {
    grid-template-columns: 1fr;
  }
}
</style>
