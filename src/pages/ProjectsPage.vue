<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { openDocx, DocxError } from '@/docx/openDocx'
import {
  createProjectId,
  deleteProject,
  listProjects,
  saveProject,
} from '@/storage/idb'
import { unpackProjectFile } from '@/storage/projectFile'
import IconButton from '@/components/IconButton.vue'
import EditorGlyph from '@/components/EditorGlyph.vue'
import type { ProjectMeta } from '@/types/project'

const { t } = useI18n()
const router = useRouter()

const projects = ref<ProjectMeta[]>([])
const error = ref('')
const busy = ref(false)
const docxInput = ref<HTMLInputElement | null>(null)
const projectInput = ref<HTMLInputElement | null>(null)
const pendingDeleteId = ref<string | null>(null)

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
        segmentSchemaVersion: 2,
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
  try {
    const record = await unpackProjectFile(file)
    // new id if colliding? keep id from file
    await saveProject(record)
    await router.push({ name: 'editor', params: { id: record.meta.id } })
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

function requestDelete(id: string) {
  pendingDeleteId.value = id
}

function cancelDelete() {
  pendingDeleteId.value = null
}

async function confirmRemove(meta: ProjectMeta) {
  await deleteProject(meta.id)
  if (pendingDeleteId.value === meta.id) pendingDeleteId.value = null
  await refresh()
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
        <div class="item-delete" @click.stop>
          <div v-if="pendingDeleteId === p.id" class="delete-confirm">
            <IconButton
              danger
              :title="t('projects.confirmDelete', { name: p.name })"
              @click="confirmRemove(p)"
            >
              <EditorGlyph name="check" />
            </IconButton>
            <IconButton :title="t('projects.deleteCancel')" @click="cancelDelete">
              <EditorGlyph name="close" />
            </IconButton>
          </div>
          <IconButton
            v-else
            danger
            :title="t('projects.delete')"
            @click="requestDelete(p.id)"
          >
            <EditorGlyph name="trash" />
          </IconButton>
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

.item-delete {
  flex: 0 0 auto;
}

.delete-confirm {
  display: inline-flex;
  align-items: center;
  gap: 0.05rem;
}
</style>
