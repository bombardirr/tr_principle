<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { openDocx, DocxError } from '@/docx/openDocx'
import {
  createProjectId,
  deleteProject,
  getProject,
  listProjects,
  saveProject,
} from '@/storage/idb'
import { unpackProjectFile } from '@/storage/projectFile'
import { getProjectBackup } from '@/projects/api'
import { ApiError } from '@/auth/api'
import { resegmentParagraphs } from '@/tm/resegment'
import { SEGMENT_SCHEMA_DATE_SAFE } from '@/types/project'
import IconButton from '@/components/IconButton.vue'
import EditorGlyph from '@/components/EditorGlyph.vue'
import SharedWorkPanel from '@/components/SharedWorkPanel.vue'
import { useAuth } from '@/auth/session'
import { listJobs, listMembers } from '@/jobs/api'
import { parseJobInviteToken } from '@/jobs/inviteToken'
import type { Job } from '@/types/job'
import type { ProjectMeta } from '@/types/project'

type PendingAction = { type: 'delete' | 'resegment'; id: string }

const { t } = useI18n()
const router = useRouter()
const { user } = useAuth()

const projects = ref<ProjectMeta[]>([])
const viewerJobs = ref<Job[]>([])
const viewerJobPanelId = ref<string | null>(null)
const error = ref('')
const notice = ref('')
const busy = ref(false)
const docxInput = ref<HTMLInputElement | null>(null)
const projectInput = ref<HTMLInputElement | null>(null)
const pending = ref<PendingAction | null>(null)
const inviteInput = ref('')
const inviteError = ref('')

async function refresh() {
  projects.value = await listProjects()
  viewerJobs.value = []
  const userId = user.value?.id
  if (!userId) return
  try {
    const jobs = await listJobs()
    const roles = await Promise.all(
      jobs.map(async job => ({
        job,
        role: (await listMembers(job.id)).find(member => member.userId === userId)?.role,
      }))
    )
    viewerJobs.value = roles.filter(item => item.role === 'viewer').map(item => item.job)
  } catch {
    // Local projects remain available while shared-work cards are offline.
  }
}

watch(() => user.value?.id, refresh, { immediate: true })

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
    await router.push({ name: 'editor', params: { id: record.meta.id } })
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

function requestAction(type: PendingAction['type'], id: string) {
  pending.value = { type, id }
}

function cancelPending() {
  pending.value = null
}

function isPending(type: PendingAction['type'], id: string) {
  return pending.value?.type === type && pending.value.id === id
}

async function confirmRemove(meta: ProjectMeta) {
  await deleteProject(meta.id)
  pending.value = null
  await refresh()
}

async function confirmResegment(meta: ProjectMeta) {
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const record = await getProject(meta.id)
    if (!record) throw new Error('Project not found')
    const { segments, ambiguousCount } = resegmentParagraphs(record.segments)
    record.segments = segments
    record.meta.segmentSchemaVersion = SEGMENT_SCHEMA_DATE_SAFE
    record.meta.segmentCount = segments.length
    await saveProject(record)
    pending.value = null
    await refresh()
    notice.value =
      ambiguousCount > 0
        ? t('projects.resegmentAmbiguous', { name: meta.name, n: ambiguousCount })
        : t('projects.resegmentDone', { name: meta.name })
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function restoreFromCloud(meta: ProjectMeta) {
  const local = await getProject(meta.id)
  if (local && !window.confirm(t('projects.restoreCloudOverwrite', { name: meta.name }))) {
    return
  }
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const bytes = await getProjectBackup(meta.id)
    const record = await unpackProjectFile(bytes)
    await saveProject(record)
    await refresh()
    notice.value = t('projects.restoreCloudOk', { name: record.meta.name || meta.name })
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      error.value = t('projects.restoreCloudMissing')
    } else {
      error.value = err instanceof Error ? err.message : String(err)
    }
  } finally {
    busy.value = false
  }
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
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

    <p v-if="!projects.length && !viewerJobs.length && !busy" class="empty">
      {{ t('projects.empty') }}
    </p>

    <ul class="list">
      <li v-for="p in projects" :key="p.id" class="item">
        <router-link class="item-link" :to="{ name: 'editor', params: { id: p.id } }">
          <span class="name">
            {{ p.name }}
            <span v-if="p.jobId" class="shared-badge">{{ t('jobs.sharedBadge') }}</span>
          </span>
          <span class="sub">
            {{ t('projects.segments', { done: p.doneCount, total: p.segmentCount }) }}
            ·
            {{ t('projects.updated', { date: formatDate(p.updatedAt) }) }}
          </span>
        </router-link>
        <div class="item-actions" @click.stop>
          <template v-if="isPending('resegment', p.id)">
            <div class="action-confirm">
              <IconButton
                :title="t('projects.confirmResegment', { name: p.name })"
                :disabled="busy"
                @click="confirmResegment(p)"
              >
                <EditorGlyph name="check" />
              </IconButton>
              <IconButton :title="t('projects.deleteCancel')" @click="cancelPending">
                <EditorGlyph name="close" />
              </IconButton>
            </div>
          </template>
          <template v-else-if="isPending('delete', p.id)">
            <div class="action-confirm">
              <IconButton
                danger
                :title="t('projects.confirmDelete', { name: p.name })"
                @click="confirmRemove(p)"
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
              @click="restoreFromCloud(p)"
            >
              <EditorGlyph name="cloud-download" />
            </IconButton>
            <IconButton
              :title="t('projects.resegment')"
              :disabled="busy"
              @click="requestAction('resegment', p.id)"
            >
              <EditorGlyph name="resegment" />
            </IconButton>
            <IconButton
              danger
              :title="t('projects.delete')"
              :disabled="busy"
              @click="requestAction('delete', p.id)"
            >
              <EditorGlyph name="trash" />
            </IconButton>
          </template>
        </div>
      </li>
    </ul>

    <section v-if="viewerJobs.length" class="viewer-jobs">
      <h2>{{ t('jobs.viewerJobsTitle') }}</h2>
      <p class="viewer-hint">{{ t('jobs.viewerJobsHint') }}</p>
      <ul class="list">
        <li v-for="job in viewerJobs" :key="job.id" class="item viewer-item">
          <button type="button" class="viewer-card" @click="viewerJobPanelId = job.id">
            <span class="name">
              {{ job.title }}
              <span class="shared-badge">{{ t('jobs.viewerBadge') }}</span>
            </span>
            <span class="sub">
              {{ job.sourceLang || '—' }} → {{ job.targetLang || '—' }} ·
              {{ t('projects.updated', { date: formatDate(job.updatedAt) }) }}
            </span>
          </button>
        </li>
      </ul>
    </section>

    <SharedWorkPanel
      v-if="viewerJobPanelId"
      :open="true"
      :job-id="viewerJobPanelId"
      @close="viewerJobPanelId = null"
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

.viewer-jobs {
  margin-top: 1.6rem;
}

.viewer-jobs h2 {
  margin: 0;
  color: var(--text);
  font-size: 1.15rem;
}

.viewer-hint {
  margin: 0.3rem 0 0;
  color: var(--text-muted);
  font-size: 0.85rem;
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

.item-link {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  text-decoration: none;
  color: inherit;
}

.viewer-card {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.15rem;
  border: 0;
  padding: 0.2rem 0.3rem;
  background: transparent;
  text-align: left;
}

.name {
  font-weight: 600;
  color: var(--text);
}

.shared-badge {
  display: inline-block;
  margin-left: 0.35rem;
  border-radius: 999px;
  padding: 0.1rem 0.45rem;
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  color: var(--accent);
  font-size: 0.68rem;
  font-weight: 700;
  vertical-align: 0.08rem;
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
</style>
