<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import EditorGlyph from '@/components/EditorGlyph.vue'
import IconButton from '@/components/IconButton.vue'
import { deleteJobTmAttachment, patchJobTmAttachment } from '@/jobs/tmAttachmentsApi'
import { getPersonalTmStats } from '@/storage/tmIdb'
import { PERSONAL_TM_ATTACHMENT_ID, type TmAttachmentCatalogItem } from '@/tm/projectAttachments'
import { listTmCatalog } from '@/tm/tmBasesCatalog'
import type { JobTmAttachment } from '@/types/job'

const props = defineProps<{
  open: boolean
  jobId: string
  attachments: JobTmAttachment[]
  isOwner: boolean
}>()

const emit = defineEmits<{
  close: []
  changed: []
  error: [message: string]
  'open-pick': []
}>()

const { t, locale } = useI18n()
const busy = ref(false)
const unitCount = ref(0)
const lastUpdatedAt = ref<string | null>(null)
const catalog = ref<TmAttachmentCatalogItem[]>([])

async function refreshStats() {
  try {
    const stats = await getPersonalTmStats()
    unitCount.value = stats.count
    lastUpdatedAt.value = stats.lastUpdatedAt
  } catch {
    unitCount.value = 0
    lastUpdatedAt.value = null
  }
}

async function refreshCatalog() {
  try {
    catalog.value = await listTmCatalog()
  } catch {
    catalog.value = []
  }
}

watch(
  () => props.open,
  async open => {
    if (!open) return
    await Promise.all([refreshStats(), refreshCatalog()])
  },
  { immediate: true },
)

function catalogItem(tmBaseId: string) {
  return catalog.value.find(item => item.id === tmBaseId)
}

function itemLabel(tmBaseId: string) {
  const item = catalogItem(tmBaseId)
  return tmBaseId === PERSONAL_TM_ATTACHMENT_ID
    ? t('projects.tmPersonalBase')
    : (item?.label ?? tmBaseId)
}

function formatTmDate(iso: string, short = false) {
  try {
    const d = new Date(iso)
    if (short) {
      return d.toLocaleDateString(locale.value, { day: 'numeric', month: 'short' })
    }
    return d.toLocaleString(locale.value, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function lastUpdatedLabel(short = false) {
  if (!lastUpdatedAt.value) return t('projects.tmLastUpdatedNever')
  const date = formatTmDate(lastUpdatedAt.value, short)
  return short ? t('projects.tmLastUpdatedShort', { date }) : t('projects.tmLastUpdated', { date })
}

async function detach(attachmentId: string) {
  if (!props.isOwner || busy.value) return
  busy.value = true
  emit('error', '')
  try {
    await deleteJobTmAttachment(props.jobId, attachmentId)
    emit('changed')
  } catch (err) {
    emit('error', err instanceof Error ? err.message : String(err))
  } finally {
    busy.value = false
  }
}

async function togglePermission(
  attachmentId: string,
  permission: 'canRead' | 'canWrite',
  value: boolean,
) {
  if (!props.isOwner || busy.value) return
  busy.value = true
  emit('error', '')
  try {
    await patchJobTmAttachment(props.jobId, attachmentId, { [permission]: value })
    emit('changed')
  } catch (err) {
    emit('error', err instanceof Error ? err.message : String(err))
  } finally {
    busy.value = false
  }
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
        </div>
        <div class="header-actions">
          <IconButton
            v-if="isOwner"
            :title="t('projects.tmBasesAdd')"
            :disabled="busy"
            @click="emit('open-pick')"
          >
            <EditorGlyph name="plus" />
          </IconButton>
          <IconButton :title="t('tmCollection.openFromProjects')" :disabled="busy" @click="emit('close')">
            <EditorGlyph name="close" />
          </IconButton>
        </div>
      </header>

      <div v-if="attachments.length === 0" class="empty">
        <p>{{ t('projects.tmBasesEmpty') }}</p>
        <IconButton
          v-if="isOwner"
          :title="t('projects.tmBasesAdd')"
          :disabled="busy"
          @click="emit('open-pick')"
        >
          <EditorGlyph name="plus" />
        </IconButton>
      </div>

      <div v-else class="grid">
        <article
          v-for="attachment in attachments"
          :key="attachment.id"
          class="card"
          :style="{
            '--tm-color': catalogItem(attachment.tmBaseId)?.color || '#5ea8ff',
          }"
        >
          <IconButton
            v-if="isOwner"
            class="detach"
            :title="t('projects.tmDetach')"
            :disabled="busy"
            @click="detach(attachment.id)"
          >
            <span aria-hidden="true">−</span>
          </IconButton>

          <div class="card-top">
            <span class="card-icon">
              <EditorGlyph :name="catalogItem(attachment.tmBaseId)?.glyph || 'tm'" />
            </span>
            <span class="card-name">{{ itemLabel(attachment.tmBaseId) }}</span>
            <span
              v-if="attachment.tmBaseId === PERSONAL_TM_ATTACHMENT_ID"
              class="card-stat"
              :title="t('projects.tmUnitsStatHint')"
            >
              {{ t('projects.tmUnitsStat', { n: unitCount }) }}
            </span>
            <span
              v-if="attachment.tmBaseId === PERSONAL_TM_ATTACHMENT_ID"
              class="card-stat"
              :title="
                lastUpdatedAt ? t('projects.tmLastUpdatedHint') : t('projects.tmLastUpdatedNeverHint')
              "
            >
              {{ lastUpdatedLabel(true) }}
            </span>
          </div>

          <div class="card-toggles">
            <div class="perm-row">
              <button
                type="button"
                class="perm"
                :class="{ on: attachment.canRead }"
                :disabled="busy || !isOwner"
                :aria-pressed="attachment.canRead"
                :title="t('projects.tmPermRead')"
                :aria-label="t('projects.tmPermRead')"
                @click="togglePermission(attachment.id, 'canRead', !attachment.canRead)"
              >
                {{ t('projects.tmPermReadShort') }}
              </button>
              <button
                type="button"
                class="perm"
                :class="{ on: attachment.canWrite }"
                :disabled="busy || !isOwner"
                :aria-pressed="attachment.canWrite"
                :title="t('projects.tmPermWrite')"
                :aria-label="t('projects.tmPermWrite')"
                @click="togglePermission(attachment.id, 'canWrite', !attachment.canWrite)"
              >
                {{ t('projects.tmPermWriteShort') }}
              </button>
            </div>
          </div>
        </article>
      </div>
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
  width: min(32rem, 100%);
  max-height: calc(100vh - 2rem);
  overflow: auto;
  padding: 1.1rem 1.2rem 1.15rem;
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.28);
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;

  h2 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 700;
  }
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.empty {
  margin: 1rem 0 0;
  padding: 1.1rem;
  border: 1px dashed var(--border);
  border-radius: 10px;
  color: var(--text-muted);
  text-align: center;
  font-size: 0.85rem;
  display: grid;
  gap: 0.75rem;
  justify-items: center;

  p {
    margin: 0;
  }
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(7.25rem, 1fr));
  gap: 0.65rem;
  margin-top: 0.85rem;
}

.card {
  position: relative;
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 0.35rem;
  padding: 0.55rem;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--tm-color) 45%, var(--border));
  background: var(--surface-2);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--tm-color) 12%, transparent);
}

.detach {
  position: absolute !important;
  top: 0.15rem;
  right: 0.15rem;
  z-index: 1;
  width: 1.5rem !important;
  height: 1.5rem !important;
  color: var(--danger) !important;
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1;
}

.card-top {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.25rem;
  padding-top: 0.15rem;
  min-height: 0;
}

.card-icon {
  display: inline-grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: 8px;
  background: color-mix(in srgb, var(--tm-color) 18%, var(--surface));
  color: var(--tm-color);
}

.card-name {
  font-size: 0.72rem;
  font-weight: 600;
  line-height: 1.25;
  padding-inline: 0.15rem;
}

.card-stat {
  font-size: 0.66rem;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.card-toggles {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.perm-row {
  display: flex;
  justify-content: center;
  gap: 0.25rem;
}

.perm {
  min-width: 1.65rem;
  border: 0;
  border-radius: 6px;
  padding: 0.12rem 0.35rem;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: 0.68rem;
  font-weight: 700;
  cursor: pointer;
  opacity: 0.38;
  filter: grayscale(0.35);

  &.on {
    color: var(--accent);
    opacity: 1;
    filter: none;
    text-shadow:
      0 0 6px color-mix(in srgb, var(--accent) 70%, transparent),
      0 0 12px color-mix(in srgb, var(--accent) 35%, transparent);
  }

  &:disabled {
    cursor: default;
    opacity: 0.3;
  }
}
</style>
