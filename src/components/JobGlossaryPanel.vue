<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import GlossaryCollectionDialog from '@/components/GlossaryCollectionDialog.vue'
import {
  createJobGlossaryAttachment,
  deleteJobGlossaryAttachment,
  listJobGlossaryAttachments,
  patchJobGlossaryAttachment,
} from '@/jobs/glossaryAttachmentsApi'
import { cloneSharedJobGlossary, exportSharedJobGlossary } from '@/glossary/jobGlossaryIo'
import { listGlossaryBases, type GlossaryBaseRecord } from '@/storage/glossaryBasesIdb'
import type { JobGlossaryAttachment } from '@/types/job'

const props = defineProps<{ jobId: string; isOwner: boolean }>()
const { t } = useI18n()
const attachments = ref<JobGlossaryAttachment[]>([])
const error = ref('')
const notice = ref('')
const pickerOpen = ref(false)
const browse = ref(false)
const cloneSource = ref<JobGlossaryAttachment | null>(null)
const cloneTargets = ref<GlossaryBaseRecord[]>([])
const cloneTargetId = ref('')

async function refresh() {
  try { attachments.value = await listJobGlossaryAttachments(props.jobId); error.value = '' }
  catch (e) { error.value = e instanceof Error ? e.message : String(e) }
}
onMounted(() => void refresh())
async function attach(glossaryBaseId: string) {
  try { attachments.value.push(await createJobGlossaryAttachment(props.jobId, { glossaryBaseId, canRead: true })); pickerOpen.value = false }
  catch (e) { error.value = e instanceof Error ? e.message : String(e) }
}
async function toggle(item: JobGlossaryAttachment, flag: 'canRead' | 'canWrite' | 'canExport' | 'canClone', event: Event) {
  if (!props.isOwner) return
  try {
    const updated = await patchJobGlossaryAttachment(props.jobId, item.id, { [flag]: (event.target as HTMLInputElement).checked })
    attachments.value = attachments.value.map(row => row.id === item.id ? updated : row)
  } catch (e) { error.value = e instanceof Error ? e.message : String(e) }
}
async function detach(item: JobGlossaryAttachment) {
  try { await deleteJobGlossaryAttachment(props.jobId, item.id); attachments.value = attachments.value.filter(row => row.id !== item.id) }
  catch (e) { error.value = e instanceof Error ? e.message : String(e) }
}
async function exportTbx(item: JobGlossaryAttachment) {
  if (!item.ownerId) return
  const result = await exportSharedJobGlossary({ jobId: props.jobId, ownerId: item.ownerId, glossaryBaseId: item.glossaryBaseId, label: item.label })
  notice.value = result.count ? t('glossary.jobExported', { count: result.count }) : t('glossary.jobEmpty')
}
async function openClone(item: JobGlossaryAttachment) {
  cloneTargets.value = (await listGlossaryBases()).filter(base => !base.sharedOnly)
  cloneTargetId.value = cloneTargets.value[0]?.id ?? ''
  cloneSource.value = item
}
async function confirmClone() {
  if (!cloneSource.value?.ownerId || !cloneTargetId.value) return
  const result = await cloneSharedJobGlossary({ jobId: props.jobId, ownerId: cloneSource.value.ownerId, glossaryBaseId: cloneSource.value.glossaryBaseId, targetBaseId: cloneTargetId.value })
  cloneSource.value = null
  notice.value = result.count ? t('glossary.jobCloned', { count: result.count }) : t('glossary.jobEmpty')
}
function closeCollection() {
  pickerOpen.value = false
  browse.value = false
}
</script>

<template>
  <section class="glossary-job">
    <header><h3>{{ t('glossary.jobTitle') }}</h3><button v-if="isOwner" type="button" @click="pickerOpen = true">+</button></header>
    <p v-if="error" class="error">{{ error }}</p><p v-if="notice" class="muted">{{ notice }}</p>
    <p v-if="!attachments.length" class="muted">{{ t('glossary.jobEmptyAttachments') }}</p>
    <article v-for="item in attachments" :key="item.id">
      <strong>{{ item.label ?? item.glossaryBaseId }}</strong>
      <label v-for="flag in ['canRead', 'canWrite', 'canExport', 'canClone'] as const" :key="flag"><span>{{ flag.replace('can', '') }}</span><input type="checkbox" :checked="item[flag]" :disabled="!isOwner" @change="toggle(item, flag, $event)" /></label>
      <button v-if="item.canRead && item.canExport && item.ownerId" type="button" @click="exportTbx(item)">{{ t('glossary.exportTbx') }}</button>
      <button v-if="item.canRead && item.canClone && item.ownerId" type="button" @click="openClone(item)">{{ t('glossary.jobClone') }}</button>
      <button v-if="isOwner" type="button" @click="detach(item)">−</button>
    </article>
    <GlossaryCollectionDialog :open="pickerOpen || browse" :mode="browse ? 'browse' : 'pick'" :attached-ids="attachments.map(item => item.glossaryBaseId)" @close="closeCollection" @attach="attach" @open-full="browse = true" @changed="refresh" />
    <div v-if="cloneSource" class="backdrop"><section class="clone"><h3>{{ t('glossary.jobCloneTitle') }}</h3><select v-model="cloneTargetId"><option v-for="base in cloneTargets" :key="base.id" :value="base.id">{{ base.label }}</option></select><button type="button" @click="cloneSource = null">{{ t('glossary.close') }}</button><button type="button" :disabled="!cloneTargetId" @click="confirmClone">{{ t('glossary.jobClone') }}</button></section></div>
  </section>
</template>

<style scoped lang="scss">
.glossary-job{margin-top:.75rem;padding-top:.75rem;border-top:1px solid var(--border)}header,article{display:flex;align-items:center;gap:.45rem}header{justify-content:space-between}h3{margin:0;font-size:.8rem}article{margin-top:.4rem;padding:.45rem;border:1px solid var(--border);border-radius:8px;background:var(--surface-2);flex-wrap:wrap}article strong{margin-right:auto;font-size:.8rem}label{font-size:.7rem;color:var(--text-muted)}button{font:inherit;font-size:.72rem}.muted{color:var(--text-muted);font-size:.75rem}.error{color:var(--danger);font-size:.75rem}.backdrop{position:fixed;inset:0;z-index:90;display:grid;place-items:center;background:color-mix(in srgb,#000 45%,transparent)}.clone{display:grid;gap:.7rem;padding:1rem;border-radius:10px;background:var(--surface)}
</style>
