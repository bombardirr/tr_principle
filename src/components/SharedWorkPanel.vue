<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  createInvite,
  getJob,
  listInvites,
  listJobResources,
  listMembers,
  patchJobResourcePreset,
  patchMyJobResource,
  revokeInvite,
} from '@/jobs/api'
import { inviteLink } from '@/jobs/localProject'
import { useAuth } from '@/auth/session'
import type {
  Job,
  JobInvite,
  JobMember,
  JobResource,
  JobResourceAcl,
  PatchJobResourceInput,
} from '@/types/job'

const props = defineProps<{
  open: boolean
  jobId: string
}>()

const emit = defineEmits<{ close: []; resourcesChanged: [] }>()
const { t } = useI18n()
const { user } = useAuth()

const job = ref<Job | null>(null)
const members = ref<JobMember[]>([])
const invites = ref<JobInvite[]>([])
const resource = ref<JobResource | null>(null)
const role = ref<'translator' | 'viewer'>('translator')
const oneTime = ref(true)
const inviteUrl = ref('')
const copied = ref(false)
const loading = ref(false)
const busy = ref(false)
const error = ref('')

const isOwner = computed(() => job.value?.ownerUserId === user.value?.id)

watch(
  () => [props.open, props.jobId] as const,
  ([open]) => {
    if (open) void load()
  },
  { immediate: true }
)

async function load() {
  loading.value = true
  error.value = ''
  inviteUrl.value = ''
  try {
    const [nextJob, nextMembers, nextResources] = await Promise.all([
      getJob(props.jobId),
      listMembers(props.jobId),
      listJobResources(props.jobId),
    ])
    job.value = nextJob
    members.value = nextMembers
    resource.value = nextResources.find(item => item.kind === 'job_tm') ?? null
    invites.value = nextJob.ownerUserId === user.value?.id ? await listInvites(props.jobId) : []
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

type ResourceFlag = keyof JobResourceAcl
const resourceFlags: ResourceFlag[] = ['canRead', 'canWrite', 'canExport', 'canClone']

function checked(event: Event) {
  return (event.target as HTMLInputElement).checked
}

async function updatePreset(flag: ResourceFlag, value: boolean) {
  if (busy.value || !resource.value) return
  busy.value = true
  error.value = ''
  try {
    const response = await patchJobResourcePreset(props.jobId, {
      kind: 'job_tm',
      [flag]: value,
    } as PatchJobResourceInput)
    resource.value = { ...resource.value, preset: response.preset }
    emit('resourcesChanged')
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function updateMine(flag: ResourceFlag | 'enabled', value: boolean) {
  if (busy.value || !resource.value) return
  busy.value = true
  error.value = ''
  try {
    resource.value = await patchMyJobResource(props.jobId, {
      kind: 'job_tm',
      [flag]: value,
    } as PatchJobResourceInput)
    emit('resourcesChanged')
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

function memberName(member: JobMember) {
  return member.displayName?.trim() || `anon:${member.userId}`
}

function roleLabel(value: JobMember['role']) {
  return t(`jobs.roles.${value}`)
}

function formatDate(value?: string | null) {
  if (!value) return t('jobs.never')
  return new Date(value).toLocaleString()
}

async function makeInvite() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  copied.value = false
  try {
    const response = await createInvite(props.jobId, {
      role: role.value,
      maxUses: oneTime.value ? 1 : undefined,
    })
    inviteUrl.value = inviteLink(response.token)
    invites.value = [response.invite, ...invites.value]
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function copyInvite() {
  if (!inviteUrl.value) return
  await navigator.clipboard.writeText(inviteUrl.value)
  copied.value = true
}

async function revoke(invite: JobInvite) {
  if (busy.value || invite.revokedAt) return
  busy.value = true
  error.value = ''
  try {
    await revokeInvite(props.jobId, invite.id)
    invites.value = invites.value.map(item =>
      item.id === invite.id ? { ...item, revokedAt: new Date().toISOString() } : item
    )
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="open" class="backdrop" role="presentation" @click.self="emit('close')">
    <aside class="panel" role="dialog" aria-modal="true" :aria-label="t('jobs.panelTitle')">
      <header class="panel-head">
        <div>
          <p class="eyebrow">{{ t('jobs.sharedWork') }}</p>
          <h2>{{ job?.title || t('jobs.panelTitle') }}</h2>
        </div>
        <button
          type="button"
          class="icon-close"
          :aria-label="t('jobs.close')"
          @click="emit('close')"
        >
          ×
        </button>
      </header>

      <p v-if="loading" class="muted">{{ t('jobs.loading') }}</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <template v-if="!loading">
        <section>
          <h3>{{ t('jobs.membersTitle') }}</h3>
          <ul class="members">
            <li v-for="member in members" :key="member.userId">
              <span class="avatar">{{ memberName(member).slice(0, 1).toUpperCase() }}</span>
              <span class="member-main">
                <strong>{{ memberName(member) }}</strong>
                <small>{{ roleLabel(member.role) }}</small>
              </span>
            </li>
          </ul>
        </section>

        <section v-if="resource">
          <h3>{{ t('jobs.resourcesTitle') }}</h3>
          <div class="resource-card">
            <div>
              <strong>{{ t('jobs.jobTmTitle') }}</strong>
              <p class="muted">{{ t('jobs.jobTmHint') }}</p>
            </div>

            <fieldset v-if="isOwner" :disabled="busy">
              <legend>{{ t('jobs.resourcePreset') }}</legend>
              <label v-for="flag in resourceFlags" :key="`preset-${flag}`" class="check">
                <input
                  type="checkbox"
                  :checked="resource.preset[flag]"
                  @change="updatePreset(flag, checked($event))"
                />
                <span>{{ t(`jobs.resourceFlags.${flag}`) }}</span>
              </label>
            </fieldset>

            <fieldset :disabled="busy">
              <legend>{{ t('jobs.personalAccess') }}</legend>
              <label class="check">
                <input
                  type="checkbox"
                  :checked="resource.enabled"
                  @change="updateMine('enabled', checked($event))"
                />
                <span>{{ t('jobs.resourceEnabled') }}</span>
              </label>
              <label v-for="flag in resourceFlags" :key="`mine-${flag}`" class="check">
                <input
                  type="checkbox"
                  :checked="resource[flag]"
                  @change="updateMine(flag, checked($event))"
                />
                <span>{{ t(`jobs.resourceFlags.${flag}`) }}</span>
              </label>
            </fieldset>

            <p class="privacy-note">{{ t('jobs.writePrivacy') }}</p>
          </div>
        </section>

        <section v-if="isOwner">
          <h3>{{ t('jobs.inviteTitle') }}</h3>
          <div class="invite-form">
            <label>
              <span>{{ t('jobs.roleLabel') }}</span>
              <select v-model="role" :disabled="busy">
                <option value="translator">{{ t('jobs.roles.translator') }}</option>
                <option value="viewer">{{ t('jobs.roles.viewer') }}</option>
              </select>
            </label>
            <label class="check">
              <input v-model="oneTime" type="checkbox" :disabled="busy" />
              <span>{{ t('jobs.oneTime') }}</span>
            </label>
            <button type="button" class="primary" :disabled="busy" @click="makeInvite">
              {{ t('jobs.createInvite') }}
            </button>
          </div>

          <div v-if="inviteUrl" class="new-link">
            <p>{{ t('jobs.copyNowHint') }}</p>
            <div>
              <input
                :value="inviteUrl"
                readonly
                @focus="($event.target as HTMLInputElement).select()"
              />
              <button type="button" class="secondary" @click="copyInvite">
                {{ copied ? t('jobs.copied') : t('jobs.copy') }}
              </button>
            </div>
          </div>

          <ul v-if="invites.length" class="invites">
            <li v-for="invite in invites" :key="invite.id">
              <span>
                <strong>{{ roleLabel(invite.role) }}</strong>
                <small>
                  {{ t('jobs.inviteUses', { used: invite.usesCount, max: invite.maxUses ?? '∞' }) }}
                  · {{ formatDate(invite.createdAt) }}
                </small>
              </span>
              <span v-if="invite.revokedAt" class="status">{{ t('jobs.revoked') }}</span>
              <button v-else type="button" class="danger" :disabled="busy" @click="revoke(invite)">
                {{ t('jobs.revoke') }}
              </button>
            </li>
          </ul>
          <p v-else class="muted">{{ t('jobs.noInvites') }}</p>
        </section>
      </template>
    </aside>
  </div>
</template>

<style scoped lang="scss">
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 84;
  display: flex;
  justify-content: flex-end;
  background: color-mix(in srgb, #000 38%, transparent);
}

.panel {
  width: min(29rem, 100%);
  height: 100%;
  overflow-y: auto;
  padding: 1.2rem 1.25rem 2rem;
  background: var(--surface);
  color: var(--text);
  box-shadow: -16px 0 48px rgba(0, 0, 0, 0.24);
}

.panel-head,
.members li,
.invites li,
.new-link > div {
  display: flex;
  align-items: center;
}

.panel-head {
  justify-content: space-between;
  gap: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border);
}

.eyebrow {
  margin: 0 0 0.2rem;
  color: var(--accent);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h2,
h3 {
  margin: 0;
}

h2 {
  font-size: 1.2rem;
}

h3 {
  margin: 1.25rem 0 0.65rem;
  font-size: 0.9rem;
}

.icon-close {
  border: 0;
  background: transparent;
  color: var(--text-muted);
  font-size: 1.5rem;
  cursor: pointer;
}

.members,
.invites {
  list-style: none;
  padding: 0;
  margin: 0;
}

.members li {
  gap: 0.65rem;
  padding: 0.55rem 0;
}

.avatar {
  display: grid;
  flex: 0 0 2rem;
  height: 2rem;
  place-items: center;
  border-radius: 50%;
  background: var(--surface-2);
  color: var(--accent);
  font-weight: 700;
}

.member-main,
.invites li > span:first-child {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

small,
.muted {
  color: var(--text-muted);
  font-size: 0.78rem;
}

.invite-form {
  display: grid;
  gap: 0.65rem;
  padding: 0.8rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-soft);
}

.resource-card {
  display: grid;
  gap: 0.75rem;
  padding: 0.8rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-soft);
}

.resource-card p {
  margin: 0.25rem 0 0;
}

fieldset {
  display: grid;
  gap: 0.45rem;
  margin: 0;
  border: 0;
  padding: 0;
}

legend {
  margin-bottom: 0.4rem;
  color: var(--text-muted);
  font-size: 0.78rem;
  font-weight: 600;
}

.privacy-note {
  border-left: 3px solid var(--accent);
  padding: 0.55rem 0.65rem;
  background: var(--surface-2);
  color: var(--text-muted);
  font-size: 0.78rem;
}

.invite-form label:not(.check) {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  color: var(--text-muted);
  font-size: 0.78rem;
  font-weight: 600;
}

select,
.new-link input {
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.5rem 0.65rem;
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
}

.check {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.85rem;
}

button {
  border-radius: 8px;
  padding: 0.45rem 0.7rem;
  font: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}

button:disabled {
  opacity: 0.55;
}

.primary {
  border: 0;
  background: var(--accent);
  color: #fff;
}

.new-link {
  margin-top: 0.7rem;
  padding: 0.7rem;
  border-radius: 10px;
  background: var(--surface-2);
}

.new-link p {
  margin: 0 0 0.45rem;
  color: var(--text-muted);
  font-size: 0.78rem;
}

.new-link > div {
  gap: 0.4rem;
}

.new-link input {
  flex: 1 1 auto;
}

.secondary {
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
}

.invites {
  margin-top: 0.8rem;
}

.invites li {
  justify-content: space-between;
  gap: 0.65rem;
  padding: 0.55rem 0;
  border-bottom: 1px solid var(--border);
}

.danger {
  border: 0;
  background: transparent;
  color: var(--danger);
}

.status {
  color: var(--text-muted);
  font-size: 0.78rem;
}

.error {
  color: var(--danger);
  font-size: 0.85rem;
}
</style>
