<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import EditorGlyph from '@/components/EditorGlyph.vue'
import { getProject, saveProject } from '@/storage/idb'
import { listTmUnits } from '@/storage/tmIdb'
import {
  detachProjectTm,
  normalizeProjectTmAttachments,
  PERSONAL_TM_ATTACHMENT_ID,
  TM_ATTACHMENT_CATALOG,
  updateProjectTmAttachment,
} from '@/tm/projectAttachments'
import type { ProjectMeta, ProjectTmAttachmentId } from '@/types/project'

const props = defineProps<{
  open: boolean
  project: ProjectMeta
}>()

const emit = defineEmits<{
  close: []
  changed: []
  error: [message: string]
  'open-pick': []
}>()

const { t } = useI18n()
const busy = ref(false)
const unitCount = ref(0)
const attachments = computed(() => normalizeProjectTmAttachments(props.project))

watch(
  () => props.open,
  async open => {
    if (!open) return
    try {
      unitCount.value = (await listTmUnits()).length
    } catch {
      unitCount.value = 0
    }
  },
  { immediate: true }
)

function catalogItem(id: ProjectTmAttachmentId) {
  return TM_ATTACHMENT_CATALOG.find(item => item.id === id)
}

function itemLabel(id: ProjectTmAttachmentId) {
  const item = catalogItem(id)
  return id === PERSONAL_TM_ATTACHMENT_ID ? t('projects.tmPersonalBase') : (item?.label ?? id)
}

async function updateAttachments(change: (meta: ProjectMeta) => ProjectMeta['tmAttachments']) {
  if (busy.value) return
  busy.value = true
  emit('error', '')
  try {
    const record = await getProject(props.project.id)
    if (!record) throw new Error(t('editor.projectNotFound'))
    record.meta.tmAttachments = change(record.meta)
    await saveProject(record)
    emit('changed')
  } catch (err) {
    emit('error', err instanceof Error ? err.message : String(err))
  } finally {
    busy.value = false
  }
}

async function detach(id: ProjectTmAttachmentId) {
  await updateAttachments(meta => detachProjectTm(meta, id))
}

async function togglePermission(
  id: ProjectTmAttachmentId,
  permission: 'canRead' | 'canWrite',
  value: boolean
) {
  await updateAttachments(meta => updateProjectTmAttachment(meta, id, { [permission]: value }))
}
</script>

<template>
  <div v-if="open" class="backdrop" role="presentation" @click.self="emit('close')">
    <section
      class="dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="t('projects.tmBasesTitle')"
    >
      <header class="header">
        <div>
          <h2>{{ t('projects.tmBasesTitle') }}</h2>
          <p>{{ t('projects.tmBasesHint') }}</p>
        </div>
        <div class="header-actions">
          <button
            type="button"
            class="icon-button add"
            :aria-label="t('projects.tmOpenPicker')"
            :disabled="busy"
            @click="emit('open-pick')"
          >
            <EditorGlyph name="plus" />
          </button>
          <button
            type="button"
            class="icon-button"
            :aria-label="t('projects.tmBasesClose')"
            :disabled="busy"
            @click="emit('close')"
          >
            <EditorGlyph name="close" />
          </button>
        </div>
      </header>

      <p v-if="attachments.length === 0" class="empty">
        {{ t('projects.tmBasesEmpty') }}
      </p>

      <div v-else class="bases">
        <article v-for="attachment in attachments" :key="attachment.id" class="base-card">
          <span
            class="glyph"
            :style="{ '--tm-color': catalogItem(attachment.id)?.color ?? 'var(--accent)' }"
          >
            <EditorGlyph :name="catalogItem(attachment.id)?.glyph ?? 'tm'" />
          </span>
          <div class="base-copy">
            <strong>{{ itemLabel(attachment.id) }}</strong>
            <span v-if="attachment.id === PERSONAL_TM_ATTACHMENT_ID" class="stat">
              {{ t('projects.tmUnitsStat', { n: unitCount }) }}
            </span>
          </div>
          <label class="permission">
            <span>R</span>
            <input
              type="checkbox"
              :checked="attachment.canRead"
              :disabled="busy"
              @change="
                togglePermission(
                  attachment.id,
                  'canRead',
                  ($event.target as HTMLInputElement).checked
                )
              "
            />
          </label>
          <label class="permission">
            <span>W</span>
            <input
              type="checkbox"
              :checked="attachment.canWrite"
              :disabled="busy"
              @change="
                togglePermission(
                  attachment.id,
                  'canWrite',
                  ($event.target as HTMLInputElement).checked
                )
              "
            />
          </label>
          <button
            type="button"
            class="detach"
            :aria-label="t('projects.tmDetach')"
            :title="t('projects.tmDetach')"
            :disabled="busy"
            @click="detach(attachment.id)"
          >
            −
          </button>
        </article>
      </div>

      <footer>
        <button type="button" class="primary" :disabled="busy" @click="emit('close')">
          {{ t('projects.tmBasesClose') }}
        </button>
      </footer>
    </section>
  </div>
</template>

<style scoped lang="scss">
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 85;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: color-mix(in srgb, #000 45%, transparent);
}

.dialog {
  width: min(38rem, 100%);
  max-height: calc(100vh - 2rem);
  overflow: auto;
  padding: 1.25rem 1.35rem 1.1rem;
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.28);
}

.header,
.header-actions,
footer,
.base-card {
  display: flex;
  align-items: center;
}

.header {
  justify-content: space-between;
  gap: 0.75rem;

  h2 {
    margin: 0;
    font-size: 1.15rem;
  }

  p {
    margin: 0.35rem 0 0;
    color: var(--text-muted);
    font-size: 0.85rem;
  }
}

.header-actions {
  gap: 0.25rem;
}

button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 8px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;

  &:disabled {
    cursor: default;
    opacity: 0.55;
  }
}

.icon-button {
  width: 2rem;
  height: 2rem;
  padding: 0;
  background: transparent;
  color: var(--text-muted);

  &.add {
    color: var(--accent);
  }
}

.empty {
  margin: 1.25rem 0;
  padding: 1rem;
  border: 1px dashed var(--border);
  border-radius: 10px;
  color: var(--text-muted);
  text-align: center;
}

.bases {
  display: grid;
  gap: 0.75rem;
  margin-top: 1rem;
}

.base-card {
  gap: 0.75rem;
  min-height: 4.5rem;
  padding: 0.75rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-2);
}

.glyph {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 10px;
  background: color-mix(in srgb, var(--tm-color) 18%, transparent);
  color: var(--tm-color);
}

.base-copy {
  display: grid;
  flex: 1 1 auto;
  min-width: 0;
  gap: 0.2rem;
}

.stat {
  color: var(--text-muted);
  font-size: 0.78rem;
}

.permission {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  color: var(--text-muted);
  font-size: 0.78rem;
}

.detach {
  width: 2rem;
  height: 2rem;
  padding: 0;
  background: transparent;
  color: var(--danger);
  font-size: 1.35rem;
}

footer {
  justify-content: flex-end;
  margin-top: 1rem;
}

.primary {
  padding: 0.5rem 0.9rem;
  background: var(--accent);
  color: #fff;
}

@media (max-width: 30rem) {
  .base-card {
    flex-wrap: wrap;
  }

  .base-copy {
    flex-basis: calc(100% - 3.25rem);
  }
}
</style>
