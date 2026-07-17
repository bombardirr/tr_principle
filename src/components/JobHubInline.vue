<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { publicActorLabel, useAuth } from '@/auth/session'
import IconButton from '@/components/IconButton.vue'
import EditorGlyph from '@/components/EditorGlyph.vue'
import MarqueeText from '@/components/MarqueeText.vue'
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
import { progressPercent } from '@/jobs/progress'
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
        <IconButton
          v-if="job"
          :title="t('jobs.manageWork')"
          :disabled="busy"
          @click="panelOpen = true"
        >
          <EditorGlyph name="user-plus" />
        </IconButton>
      </h3>
    </header>

    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="busy && !job" class="muted">{{ t('jobs.loading') }}</p>

    <ul v-if="job" class="members">
      <li v-for="member in members" :key="member.userId" class="member-row">
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
          :source-lang="job?.sourceLang"
          :target-lang="job?.targetLang"
          glow
          @changed="onProjectChanged"
          @notice="emit('notice', $event)"
          @error="emit('error', $event)"
        />
      </ul>
      <section v-else class="hub-card">
        <p class="muted">
          {{ t('jobs.noLinkedProject') }}
          <template v-if="job">
            · {{ job.sourceLang || '—' }} → {{ job.targetLang || '—' }}
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
