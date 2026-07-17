<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/auth/session'
import IconButton from '@/components/IconButton.vue'
import EditorGlyph from '@/components/EditorGlyph.vue'
import ProjectListItem from '@/components/ProjectListItem.vue'
import SharedWorkPanel from '@/components/SharedWorkPanel.vue'
import { openDocx } from '@/docx/openDocx'
import { createEmptyJobProject } from '@/jobs/createProject'
import { fingerprintMismatch } from '@/jobs/fingerprint'
import { bindProjectToJob, projectFingerprint } from '@/jobs/localProject'
import { getJob, listMembers, patchJobMemberMe } from '@/jobs/api'
import { createProjectId, getProject, listProjects, saveProject } from '@/storage/idb'
import { unpackProjectFile } from '@/storage/projectFile'
import { SEGMENT_SCHEMA_DATE_SAFE, type ProjectMeta, type ProjectRecord } from '@/types/project'
import { acknowledgeJobJoins } from '@/jobs/joinActivity'
import type { Job, JobMember } from '@/types/job'

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
const pendingProject = ref<ProjectRecord | null>(null)
const mismatchOpen = ref(false)

const myMember = computed(() => members.value.find(member => member.userId === user.value?.id))
const canHaveProject = computed(
  () => myMember.value?.role === 'owner' || myMember.value?.role === 'translator',
)
const linkedProject = computed(() => {
  const localId = myMember.value?.localProjectId
  return projects.value.find(project => project.id === localId || project.jobId === props.jobId)
})

watch(
  () => props.jobId,
  () => {
    void load()
  },
  { immediate: true },
)

async function load() {
  if (!props.jobId) return
  busy.value = true
  error.value = ''
  job.value = null
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
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

function closePanel() {
  panelOpen.value = false
  void load()
  emit('changed')
}

async function onProjectChanged() {
  await load()
  emit('changed')
}

function memberName(member: JobMember) {
  return member.displayName?.trim() || `anon:${member.userId}`
}

function roleLabel(role: JobMember['role']) {
  return t(`jobs.roles.${role}`)
}

async function bind(record: ProjectRecord) {
  if (!job.value) return
  const linked = bindProjectToJob(record, job.value)
  await saveProject(linked)
  await patchJobMemberMe(job.value.id, { localProjectId: linked.meta.id })
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
</script>

<template>
  <section class="job-hub">
    <button type="button" class="back" @click="emit('close')">
      ← {{ t('jobs.backToSharedList') }}
    </button>

    <header class="hub-head">
      <h3 class="hub-title">
        <span>{{ job?.title || t('jobs.panelTitle') }}</span>
        <span v-if="job" class="lang-chip">
          {{ job.sourceLang || '—' }} → {{ job.targetLang || '—' }}
        </span>
      </h3>
    </header>

    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="busy && !job" class="muted">{{ t('jobs.loading') }}</p>

    <section v-if="job" class="hub-card">
      <div class="hub-card-head">
        <h4>{{ t('jobs.membersTitle') }}</h4>
        <IconButton
          :title="t('jobs.manageWork')"
          :disabled="busy"
          @click="panelOpen = true"
        >
          <EditorGlyph name="send" />
        </IconButton>
      </div>
      <ul class="members">
        <li v-for="member in members" :key="member.userId">
          <span>
            <strong>{{ memberName(member) }}</strong>
            <small>{{ roleLabel(member.role) }}</small>
          </span>
          <span>{{ member.progressDone }} / {{ member.progressTotal }}</span>
          <span :class="{ done: member.partDone }">
            {{ member.partDone ? t('jobs.partDoneYes') : t('jobs.partDoneNo') }}
          </span>
        </li>
      </ul>
    </section>

    <template v-if="job && canHaveProject">
      <ul v-if="linkedProject" class="list">
        <ProjectListItem
          :project="linkedProject"
          glow
          @changed="onProjectChanged"
          @notice="emit('notice', $event)"
          @error="emit('error', $event)"
        />
      </ul>
      <section v-else class="hub-card">
        <p class="muted">{{ t('jobs.noLinkedProject') }}</p>
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
.hub-card-head,
.members li,
.project-actions,
.bind-row {
  display: flex;
  align-items: center;
}

.hub-head {
  margin: 0 0 0.45rem;
}

.hub-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.55rem;
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1.25;
}

.lang-chip {
  display: inline-flex;
  align-items: center;
  padding: 0.12rem 0.45rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent) 14%, var(--surface-soft));
  color: var(--accent);
  font-size: 0.72rem;
  font-weight: 650;
  line-height: 1.3;
}

.hub-card-head {
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.hub-card-head h4 {
  margin: 0;
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

.hub-card-head h4 {
  margin-bottom: 0;
}

.muted,
small {
  color: var(--text-muted);
  font-size: 0.78rem;
}

.list {
  list-style: none;
  padding: 0;
  margin: 0.55rem 0 0;
}

.hub-card {
  margin-top: 0.45rem;
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-soft);
}

.members {
  margin: 0;
  padding: 0;
  list-style: none;
}

.members li {
  justify-content: space-between;
  gap: 0.65rem;
  padding: 0.28rem 0;
  border-bottom: 1px solid var(--border);
  font-size: 0.8rem;
  line-height: 1.3;
}

.members li:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}

.members li:first-child {
  padding-top: 0;
}

.members li > span:first-child {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.35rem;
  min-width: 0;
}

.members li > span:first-child strong {
  font-weight: 600;
}

.members li > span:first-child small {
  font-size: 0.72rem;
}

.done {
  color: var(--ok);
}

.project-actions,
.bind-row {
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.4rem;
}

button:not(.back),
select {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.28rem 0.55rem;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.8rem;
}

button:not(.back) {
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
