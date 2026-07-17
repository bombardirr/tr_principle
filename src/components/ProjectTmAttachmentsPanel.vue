<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/auth/session'
import { downloadBlob } from '@/docx/exportDocx'
import { getCloudProject } from '@/projects/collabApi'
import {
  attachPersonalTm,
  cloneProjectTmAttachment,
  exportProjectTmAttachment,
  listProjectTmAttachments,
  patchProjectTmAttachment,
  type ProjectTmAttachment,
} from '@/projects/projectTmApi'

const props = defineProps<{ open: boolean; projectId: string }>()
const emit = defineEmits<{ close: []; changed: [] }>()
const { t } = useI18n()
const { user } = useAuth()
const attachments = ref<ProjectTmAttachment[]>([])
const isOwner = ref(false)
const busy = ref(false)
const error = ref('')

const hasPersonalAttachment = computed(() =>
  attachments.value.some(item => item.kind === 'user' && item.userId === user.value?.id),
)

async function refresh() {
  if (!props.open) return
  busy.value = true
  error.value = ''
  try {
    const [project, data] = await Promise.all([
      getCloudProject(props.projectId),
      listProjectTmAttachments(props.projectId),
    ])
    isOwner.value = project.ownerUserId === user.value?.id
    attachments.value = data.attachments
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

watch(() => [props.open, props.projectId], refresh, { immediate: true })

async function attach() {
  busy.value = true
  try {
    const attachment = await attachPersonalTm(props.projectId)
    attachments.value = [...attachments.value.filter(item => item.id !== attachment.id), attachment]
    emit('changed')
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function update(attachment: ProjectTmAttachment, key: 'canRead' | 'canWrite' | 'canExport' | 'canClone') {
  busy.value = true
  try {
    const updated = await patchProjectTmAttachment(props.projectId, attachment.id, { [key]: !attachment[key] })
    attachments.value = attachments.value.map(item => (item.id === updated.id ? updated : item))
    emit('changed')
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function clone(attachment: ProjectTmAttachment) {
  busy.value = true
  try {
    await cloneProjectTmAttachment(props.projectId, attachment.id)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function exportTmx(attachment: ProjectTmAttachment) {
  busy.value = true
  try {
    const blob = await exportProjectTmAttachment(props.projectId, attachment.id)
    downloadBlob(blob, 'translation-memory.tmx')
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="open" class="backdrop" role="presentation" @click.self="emit('close')">
    <section class="panel" role="dialog" aria-modal="true" :aria-label="t('projectTm.title')">
      <header>
        <h2>{{ t('projectTm.title') }}</h2>
        <button type="button" class="close" :aria-label="t('projectTm.close')" @click="emit('close')">×</button>
      </header>
      <p v-if="error" class="error">{{ error }}</p>
      <button type="button" class="primary" :disabled="busy || hasPersonalAttachment" @click="attach">
        {{ t('projectTm.attachPersonal') }}
      </button>
      <p class="hint">{{ isOwner ? t('projectTm.ownerHint') : t('projectTm.memberHint') }}</p>
      <article v-for="attachment in attachments" :key="attachment.id" class="attachment">
        <strong>{{ attachment.kind === 'project' ? t('projectTm.projectMemory') : t('projectTm.personalMemory') }}</strong>
        <div v-if="isOwner" class="permissions">
          <label v-for="key in ['canRead', 'canWrite', 'canExport', 'canClone'] as const" :key="key">
            <input :checked="attachment[key]" type="checkbox" :disabled="busy" @change="update(attachment, key)" />
            {{ t(`projectTm.${key}`) }}
          </label>
        </div>
        <div class="actions">
          <button type="button" :disabled="busy || !attachment.canExport" @click="exportTmx(attachment)">
            {{ t('projectTm.export') }}
          </button>
          <button type="button" :disabled="busy || !attachment.canClone" @click="clone(attachment)">
            {{ t('projectTm.clone') }}
          </button>
        </div>
      </article>
    </section>
  </div>
</template>

<style scoped lang="scss">
.backdrop { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; padding: 1rem; background: color-mix(in srgb, #000 45%, transparent); }
.panel { width: min(36rem, 100%); max-height: min(42rem, 90vh); overflow: auto; padding: 1.25rem; border-radius: 12px; background: var(--surface); color: var(--text); box-shadow: 0 16px 48px rgba(0,0,0,.28); }
header, .actions { display: flex; align-items: center; gap: .6rem; } header { justify-content: space-between; } h2 { margin: 0; } button { font: inherit; cursor: pointer; } .close { border: 0; background: transparent; color: var(--text); font-size: 1.5rem; } .primary, .actions button { border: 0; border-radius: 7px; padding: .45rem .7rem; background: var(--surface-2); color: var(--text); } .primary { margin-top: 1rem; background: var(--accent); color: #fff; font-weight: 600; } .hint { color: var(--text-muted); font-size: .82rem; } .attachment { display: grid; gap: .6rem; padding: .8rem 0; border-top: 1px solid var(--border); } .permissions { display: flex; flex-wrap: wrap; gap: .55rem 1rem; font-size: .82rem; } .permissions label { display: flex; gap: .3rem; align-items: center; } .error { color: var(--danger); } button:disabled { cursor: default; opacity: .55; }
</style>
