<script setup lang="ts">
import { onMounted, ref } from 'vue'
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
import type { ProjectMeta } from '@/types/project'

type PendingAction = { type: 'delete' | 'resegment'; id: string }

const { t } = useI18n()
const router = useRouter()

const projects = ref<ProjectMeta[]>([])
const error = ref('')
const notice = ref('')
const busy = ref(false)
const docxInput = ref<HTMLInputElement | null>(null)
const projectInput = ref<HTMLInputElement | null>(null)
const pending = ref<PendingAction | null>(null)

async function refresh() {
  projects.value = await listProjects()
}

onMounted(refresh)

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
    error.value =
      err instanceof DocxError || err instanceof Error
        ? err.message
        : String(err)
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
</script>

<template>
  <section>
    <div class="head">
      <h1>{{ t('projects.title') }}</h1>
      <div class="actions">
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
    <p v-else-if="notice" class="notice">{{ notice }}</p>

    <p v-if="!projects.length && !busy" class="empty">{{ t('projects.empty') }}</p>

    <ul class="list">
      <li v-for="p in projects" :key="p.id" class="item">
        <router-link class="item-link" :to="{ name: 'editor', params: { id: p.id } }">
          <span class="name">{{ p.name }}</span>
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
  </section>
</template>

<style scoped lang="scss">
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

button {
  border: none;
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
  border-radius: 10px;
  padding: 0.5rem 0.35rem 0.5rem 0.65rem;
  margin-bottom: 0.45rem;
  transition: background 0.15s ease;
}

.item:hover {
  background: var(--surface);
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

.name {
  font-weight: 600;
  color: var(--text);
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
