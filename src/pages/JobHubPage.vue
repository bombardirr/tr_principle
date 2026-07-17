<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/auth/session'
import SharedWorkPanel from '@/components/SharedWorkPanel.vue'
import { openDocx } from '@/docx/openDocx'
import { createEmptyJobProject } from '@/jobs/createProject'
import { fingerprintMismatch } from '@/jobs/fingerprint'
import { bindProjectToJob, projectFingerprint } from '@/jobs/localProject'
import { getJob, listMembers, patchJobMemberMe } from '@/jobs/api'
import { createProjectId, getProject, listProjects, saveProject } from '@/storage/idb'
import { unpackProjectFile } from '@/storage/projectFile'
import { SEGMENT_SCHEMA_DATE_SAFE, type ProjectMeta, type ProjectRecord } from '@/types/project'
import type { Job, JobMember } from '@/types/job'

const { t } = useI18n()
const route = useRoute()
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

const jobId = computed(() => String(route.params.id ?? ''))
const myMember = computed(() => members.value.find(member => member.userId === user.value?.id))
const canHaveProject = computed(
  () => myMember.value?.role === 'owner' || myMember.value?.role === 'translator'
)
const linkedProject = computed(() => {
  const localId = myMember.value?.localProjectId
  return projects.value.find(project => project.id === localId || project.jobId === jobId.value)
})

onMounted(load)

async function load() {
  busy.value = true
  error.value = ''
  try {
    const [nextJob, nextMembers, nextProjects] = await Promise.all([
      getJob(jobId.value),
      listMembers(jobId.value),
      listProjects(),
    ])
    job.value = nextJob
    members.value = nextMembers
    projects.value = nextProjects
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
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
    <router-link class="back" to="/projects">← {{ t('jobs.backToProjects') }}</router-link>

    <header class="hub-head">
      <div>
        <p class="eyebrow">{{ t('jobs.sharedWork') }}</p>
        <h1>{{ job?.title || t('jobs.panelTitle') }}</h1>
        <p v-if="job" class="muted">{{ job.sourceLang || '—' }} → {{ job.targetLang || '—' }}</p>
      </div>
      <button type="button" :disabled="busy" @click="panelOpen = true">
        {{ t('jobs.manageWork') }}
      </button>
    </header>

    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="busy && !job" class="muted">{{ t('jobs.loading') }}</p>

    <section v-if="job" class="hub-card">
      <h2>{{ t('jobs.membersTitle') }}</h2>
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

    <section v-if="job && canHaveProject" class="hub-card">
      <h2>{{ t('jobs.myProjectTitle') }}</h2>
      <template v-if="linkedProject">
        <p class="muted">{{ t('jobs.linkedProject', { name: linkedProject.name }) }}</p>
        <router-link
          class="primary-link"
          :to="{ name: 'editor', params: { id: linkedProject.id } }"
        >
          {{ t('jobs.openLinkedProject') }}
        </router-link>
      </template>
      <template v-else>
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
      </template>
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
    </section>

    <section v-else-if="job" class="hub-card">
      <h2>{{ t('jobs.viewerHubTitle') }}</h2>
      <p class="muted">{{ t('jobs.viewerHubHint') }}</p>
    </section>

    <SharedWorkPanel
      v-if="panelOpen"
      :open="panelOpen"
      :job-id="jobId"
      @close="
        panelOpen = false
        load()
      "
    />

    <div v-if="mismatchOpen" class="modal-backdrop">
      <div class="modal" role="alertdialog" aria-modal="true">
        <h2>{{ t('jobs.mismatchTitle') }}</h2>
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
  max-width: 58rem;
  margin: 0 auto;
  padding: 1.25rem 0 2rem;
  color: var(--text);
}

.back {
  color: var(--text-muted);
  text-decoration: none;
}

.hub-head,
.members li,
.project-actions,
.bind-row {
  display: flex;
  align-items: center;
}

.hub-head {
  justify-content: space-between;
  gap: 1rem;
  margin: 1rem 0;
}

.eyebrow {
  margin: 0 0 0.2rem;
  color: var(--accent);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1,
h2,
.muted {
  margin: 0;
}

h1 {
  font-size: 1.7rem;
}

h2 {
  margin-bottom: 0.8rem;
  font-size: 1rem;
}

.muted,
small {
  color: var(--text-muted);
}

.hub-card {
  margin-top: 0.85rem;
  padding: 1rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-soft);
}

.members {
  margin: 0;
  padding: 0;
  list-style: none;
}

.members li {
  justify-content: space-between;
  gap: 1rem;
  padding: 0.55rem 0;
  border-bottom: 1px solid var(--border);
  font-size: 0.85rem;
}

.members li > span:first-child {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
}

.done {
  color: var(--ok);
}

.project-actions,
.bind-row {
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.8rem;
}

button,
.primary-link,
select {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.5rem 0.8rem;
  background: var(--surface);
  color: var(--text);
  font: inherit;
}

button,
.primary-link {
  cursor: pointer;
  text-decoration: none;
}

.primary,
.primary-link {
  border-color: var(--accent-strong);
  background: var(--accent-strong);
  color: var(--accent-text);
}

.primary-link {
  display: inline-block;
  margin-top: 0.8rem;
}

.bind-row select {
  min-width: 15rem;
}

.error {
  color: var(--danger);
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
  width: min(28rem, 100%);
  padding: 1.25rem;
  border-radius: 12px;
  background: var(--surface);
}
</style>
