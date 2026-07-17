<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { acceptInvite, getJob, patchJobMemberMe } from '@/jobs/api'
import { bindProjectToJob, projectFingerprint } from '@/jobs/localProject'
import { fingerprintMismatch } from '@/jobs/fingerprint'
import { getProject, listProjects, saveProject } from '@/storage/idb'
import { unpackProjectFile } from '@/storage/projectFile'
import type { Job } from '@/types/job'
import type { ProjectMeta, ProjectRecord } from '@/types/project'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const projects = ref<ProjectMeta[]>([])
const selectedId = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const acceptedJob = ref<Job | null>(null)
const pendingProject = ref<ProjectRecord | null>(null)
const mismatchOpen = ref(false)

const token = computed(() => String(route.params.token ?? '').trim())
const selected = computed(() => projects.value.find(project => project.id === selectedId.value))

onMounted(async () => {
  projects.value = await listProjects()
  if (projects.value.length === 1) selectedId.value = projects.value[0]!.id
})

async function onProjectFileSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const record = await unpackProjectFile(file)
    const existing = await getProject(record.meta.id)
    if (existing && !window.confirm(t('jobs.importOverwrite', { name: existing.meta.name }))) {
      return
    }
    await saveProject(record)
    projects.value = await listProjects()
    selectedId.value = record.meta.id
    notice.value = t('jobs.imported', { name: record.meta.name })
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function resolveAcceptedJob(): Promise<Job> {
  if (acceptedJob.value) return acceptedJob.value
  const accepted = await acceptInvite({ token: token.value })
  const job = await getJob(accepted.jobId)
  acceptedJob.value = job
  return job
}

async function joinWithoutProject() {
  if (!token.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const accepted = await acceptInvite({ token: token.value })
    await router.push({ name: 'job-hub', params: { id: accepted.jobId } })
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function joinWithProject() {
  if (!selectedId.value || !token.value || busy.value) return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const record = await getProject(selectedId.value)
    if (!record) throw new Error(t('jobs.localProjectMissing'))
    const job = await resolveAcceptedJob()
    const localFingerprint = await projectFingerprint(record)
    pendingProject.value = record
    if (fingerprintMismatch(job, localFingerprint)) {
      mismatchOpen.value = true
      return
    }
    await finishBinding(record, job)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function finishBinding(record: ProjectRecord, job: Job) {
  busy.value = true
  error.value = ''
  try {
    const linked = bindProjectToJob(record, job)
    await saveProject(linked)
    await patchJobMemberMe(job.id, { localProjectId: linked.meta.id })
    mismatchOpen.value = false
    await router.push({ name: 'job-hub', params: { id: job.id } })
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function continueMismatch() {
  if (!pendingProject.value || !acceptedJob.value) return
  await finishBinding(pendingProject.value, acceptedJob.value)
}
</script>

<template>
  <section class="invite-page">
    <div class="card">
      <p class="eyebrow">{{ t('jobs.sharedWork') }}</p>
      <h1>{{ t('jobs.joinTitle') }}</h1>
      <p class="lead">{{ t('jobs.joinHint') }}</p>

      <button
        type="button"
        class="primary membership-join"
        :disabled="busy || !token"
        @click="joinWithoutProject"
      >
        {{ busy ? t('jobs.joining') : t('jobs.joinMembership') }}
      </button>
      <p class="selection">{{ t('jobs.joinMembershipHint') }}</p>

      <div class="divider">
        <span>{{ t('jobs.bindNow') }}</span>
      </div>

      <div class="import-box">
        <h2>{{ t('jobs.importTitle') }}</h2>
        <p>{{ t('jobs.importHint') }}</p>
        <button type="button" class="secondary" :disabled="busy" @click="fileInput?.click()">
          {{ t('jobs.choosePackage') }}
        </button>
        <input
          ref="fileInput"
          type="file"
          accept=".zip,.tcat.zip,application/zip"
          hidden
          @change="onProjectFileSelected"
        />
      </div>

      <p class="or-label">{{ t('jobs.or') }}</p>

      <label class="field">
        <span>{{ t('jobs.localProjectLabel') }}</span>
        <select v-model="selectedId" :disabled="busy || !projects.length">
          <option value="" disabled>{{ t('jobs.chooseLocalProject') }}</option>
          <option v-for="project in projects" :key="project.id" :value="project.id">
            {{ project.name }}
          </option>
        </select>
      </label>
      <p v-if="selected" class="selection">
        {{ t('jobs.selectedProject', { name: selected.name }) }}
      </p>
      <p v-else-if="!projects.length" class="selection">{{ t('jobs.noLocalProjects') }}</p>

      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <p v-else-if="notice" class="notice">{{ notice }}</p>

      <div class="actions">
        <router-link class="cancel" to="/projects">{{ t('jobs.cancel') }}</router-link>
        <button
          type="button"
          class="primary"
          :disabled="busy || !selectedId || !token"
          @click="joinWithProject"
        >
          {{ busy ? t('jobs.joining') : t('jobs.joinAndBind') }}
        </button>
      </div>
    </div>

    <div v-if="mismatchOpen" class="modal-backdrop" role="presentation">
      <div class="modal" role="alertdialog" aria-modal="true" :aria-label="t('jobs.mismatchTitle')">
        <h2>{{ t('jobs.mismatchTitle') }}</h2>
        <p>{{ t('jobs.mismatchHint') }}</p>
        <div class="actions">
          <button
            type="button"
            class="cancel-button"
            :disabled="busy"
            @click="mismatchOpen = false"
          >
            {{ t('jobs.mismatchCancel') }}
          </button>
          <button type="button" class="primary" :disabled="busy" @click="continueMismatch">
            {{ t('jobs.mismatchContinue') }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.invite-page {
  display: grid;
  min-height: calc(100vh - 7rem);
  place-items: center;
  padding: 2rem 1rem;
}

.card {
  width: min(34rem, 100%);
  padding: clamp(1.25rem, 4vw, 2rem);
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.12);
}

.eyebrow {
  margin: 0 0 0.35rem;
  color: var(--accent);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1,
h2 {
  margin: 0;
}

h1 {
  font-size: 1.6rem;
}

h2 {
  font-size: 1rem;
}

.lead,
.import-box p,
.selection {
  color: var(--text-muted);
  font-size: 0.88rem;
  line-height: 1.45;
}

.import-box {
  margin-top: 1.25rem;
  padding: 1rem;
  border: 1px dashed var(--border-strong);
  border-radius: 10px;
  background: var(--surface-soft);
}

.import-box p {
  margin: 0.35rem 0 0.8rem;
}

.divider {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  margin: 1rem 0;
  color: var(--text-muted);
  font-size: 0.75rem;
}

.divider::before,
.divider::after {
  height: 1px;
  flex: 1;
  background: var(--border);
  content: '';
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  color: var(--text-muted);
  font-size: 0.8rem;
  font-weight: 600;
}

select {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.55rem 0.7rem;
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
}

.selection {
  margin: 0.4rem 0 0;
}

.membership-join {
  width: 100%;
  margin-top: 1rem;
}

.or-label {
  margin: 0.8rem 0;
  color: var(--text-muted);
  font-size: 0.78rem;
  text-align: center;
}

.actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.6rem;
  margin-top: 1.25rem;
}

button,
.cancel {
  border-radius: 8px;
  padding: 0.52rem 0.9rem;
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}

button:disabled {
  cursor: default;
  opacity: 0.55;
}

.primary {
  border: 0;
  background: var(--accent);
  color: #fff;
}

.secondary,
.cancel-button {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
}

.cancel {
  color: var(--text-muted);
}

.error {
  color: var(--danger);
}

.notice {
  color: var(--ok);
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
  padding: 1.3rem;
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.28);
}

.modal p {
  color: var(--text-muted);
  line-height: 1.45;
}
</style>
