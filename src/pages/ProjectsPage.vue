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
import type { ProjectMeta } from '@/types/project'

const { t } = useI18n()
const router = useRouter()

const projects = ref<ProjectMeta[]>([])
const error = ref('')
const busy = ref(false)
const docxInput = ref<HTMLInputElement | null>(null)
const projectInput = ref<HTMLInputElement | null>(null)

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

async function remove(meta: ProjectMeta) {
  if (!confirm(t('projects.confirmDelete', { name: meta.name }))) return
  await deleteProject(meta.id)
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
        <div>
          <router-link class="name" :to="{ name: 'editor', params: { id: p.id } }">
            {{ p.name }}
          </router-link>
          <div class="sub">
            {{ t('projects.segments', { done: p.doneCount, total: p.segmentCount }) }}
            ·
            {{ t('projects.updated', { date: formatDate(p.updatedAt) }) }}
          </div>
        </div>
        <div class="item-actions">
          <router-link class="link-btn" :to="{ name: 'editor', params: { id: p.id } }">
            {{ t('projects.open') }}
          </router-link>
          <button type="button" class="danger" @click="remove(p)">{{ t('projects.delete') }}</button>
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

button,
.link-btn {
  border: 1px solid var(--border-strong);
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
  border-color: var(--accent-strong);
  color: var(--accent-text);
}

button.danger {
  color: var(--danger);
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
  justify-content: space-between;
  gap: 1rem;
  align-items: center;
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 0.9rem 1rem;
  margin-bottom: 0.6rem;
}

.name {
  font-weight: 600;
  color: var(--text);
  text-decoration: none;
}

.sub {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin-top: 0.2rem;
}

.item-actions {
  display: flex;
  gap: 0.4rem;
}
</style>
