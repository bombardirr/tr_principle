<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  createInvite,
  getJob,
  listInvites,
  listMembers,
  patchJobMemberMe,
  revokeInvite,
  transferJob,
} from '@/jobs/api'
import { inviteLink } from '@/jobs/localProject'
import { useAuth } from '@/auth/session'
import type { Job, JobInvite, JobMember } from '@/types/job'
import JobMemoriesPanel from '@/components/JobMemoriesPanel.vue'

const props = defineProps<{
  open: boolean
  jobId: string
}>()

const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const { user } = useAuth()

const job = ref<Job | null>(null)
const members = ref<JobMember[]>([])
const invites = ref<JobInvite[]>([])
const role = ref<'translator' | 'viewer'>('translator')
const oneTime = ref(true)
const inviteUrl = ref('')
const copied = ref(false)
const transferTargetId = ref('')
const loading = ref(false)
const busy = ref(false)
const error = ref('')

const isOwner = computed(() => job.value?.ownerUserId === user.value?.id)
const transferCandidates = computed(() =>
  members.value.filter(member => member.userId !== user.value?.id)
)
const myMember = computed(() => members.value.find(member => member.userId === user.value?.id))
const canMarkPartDone = computed(() => myMember.value && myMember.value.role !== 'viewer')

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
    const [nextJob, nextMembers] = await Promise.all([
      getJob(props.jobId),
      listMembers(props.jobId),
    ])
    job.value = nextJob
    members.value = nextMembers
    invites.value = nextJob.ownerUserId === user.value?.id ? await listInvites(props.jobId) : []
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

function memberName(member: JobMember) {
  return member.displayName?.trim() || `anon:${member.userId}`
}

function checked(event: Event) {
  return (event.target as HTMLInputElement).checked
}

function roleLabel(value: JobMember['role']) {
  return t(`jobs.roles.${value}`)
}

function formatDate(value?: string | null) {
  if (!value) return t('jobs.never')
  return new Date(value).toLocaleString()
}

function progressLabel(member: JobMember) {
  return `${member.progressDone} / ${member.progressTotal}`
}

async function updatePartDone(value: boolean) {
  if (busy.value || !myMember.value || !canMarkPartDone.value) return
  busy.value = true
  error.value = ''
  try {
    const updated = await patchJobMemberMe(props.jobId, { partDone: value })
    members.value = members.value.map(member =>
      member.userId === updated.userId ? updated : member
    )
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
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

async function transferOwnership() {
  if (busy.value || !transferTargetId.value) return
  const target = members.value.find(member => member.userId === transferTargetId.value)
  if (!target) return
  if (!window.confirm(t('jobs.transferConfirm', { name: memberName(target) }))) return
  busy.value = true
  error.value = ''
  try {
    job.value = await transferJob(props.jobId, transferTargetId.value)
    members.value = await listMembers(props.jobId)
    transferTargetId.value = ''
    invites.value = []
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
          <div class="member-columns" aria-hidden="true">
            <span>{{ t('jobs.memberColumn') }}</span>
            <span>{{ t('jobs.progressColumn') }}</span>
            <span>{{ t('jobs.partDoneColumn') }}</span>
          </div>
          <ul class="members">
            <li v-for="member in members" :key="member.userId">
              <span class="avatar">{{ memberName(member).slice(0, 1).toUpperCase() }}</span>
              <span class="member-main">
                <strong>{{ memberName(member) }}</strong>
                <small>{{ roleLabel(member.role) }}</small>
              </span>
              <span class="member-progress">{{ progressLabel(member) }}</span>
              <span class="member-done" :class="{ complete: member.partDone }">
                {{ member.partDone ? t('jobs.partDoneYes') : t('jobs.partDoneNo') }}
              </span>
            </li>
          </ul>
          <label v-if="canMarkPartDone" class="check part-done-toggle">
            <input
              type="checkbox"
              :checked="myMember?.partDone"
              :disabled="busy"
              @change="updatePartDone(checked($event))"
            />
            <span>{{ t('jobs.myPartDone') }}</span>
          </label>

          <div v-if="isOwner && transferCandidates.length" class="transfer-form">
            <h3>{{ t('jobs.transferTitle') }}</h3>
            <p class="muted">{{ t('jobs.transferHint') }}</p>
            <label>
              <span>{{ t('jobs.transferLabel') }}</span>
              <select v-model="transferTargetId" :disabled="busy">
                <option value="">{{ t('jobs.transferChoose') }}</option>
                <option
                  v-for="member in transferCandidates"
                  :key="member.userId"
                  :value="member.userId"
                >
                  {{ memberName(member) }} ({{ roleLabel(member.role) }})
                </option>
              </select>
            </label>
            <button
              type="button"
              class="secondary"
              :disabled="busy || !transferTargetId"
              @click="transferOwnership"
            >
              {{ t('jobs.transferAction') }}
            </button>
          </div>
        </section>

        <JobMemoriesPanel
          v-if="job"
          :job-id="jobId"
          :is-owner="isOwner"
          :my-role="myMember?.role ?? null"
        />

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
  width: min(26rem, 100%);
  height: 100%;
  overflow-y: auto;
  padding: 0.75rem 0.85rem 1.25rem;
  background: var(--surface);
  color: var(--text);
  box-shadow: -12px 0 36px rgba(0, 0, 0, 0.22);
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
  gap: 0.65rem;
  padding-bottom: 0.55rem;
  border-bottom: 1px solid var(--border);
}

h2,
h3 {
  margin: 0;
}

h2 {
  font-size: 1.05rem;
  line-height: 1.25;
}

h3 {
  margin: 0.75rem 0 0.4rem;
  font-size: 0.8rem;
}

.icon-close {
  border: 0;
  background: transparent;
  color: var(--text-muted);
  font-size: 1.35rem;
  line-height: 1;
  cursor: pointer;
}

.members,
.invites {
  list-style: none;
  padding: 0;
  margin: 0;
}

.members li {
  gap: 0.45rem;
  padding: 0.32rem 0;
}

.member-columns {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 0.5rem;
  padding: 0 0 0.2rem 2.1rem;
  color: var(--text-muted);
  font-size: 0.65rem;
  font-weight: 600;
}

.member-columns span:not(:first-child) {
  min-width: 3.75rem;
  text-align: right;
}

.avatar {
  display: grid;
  flex: 0 0 1.55rem;
  height: 1.55rem;
  place-items: center;
  border-radius: 50%;
  background: var(--surface-2);
  color: var(--accent);
  font-size: 0.72rem;
  font-weight: 700;
}

.member-main,
.invites li > span:first-child {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 0.05rem;
}

.member-main {
  flex: 1 1 auto;
}

.member-main strong {
  font-size: 0.82rem;
  font-weight: 600;
}

.member-progress,
.member-done {
  min-width: 3.75rem;
  text-align: right;
  color: var(--text-muted);
  font-size: 0.72rem;
}

.member-done.complete {
  color: var(--ok);
  font-weight: 600;
}

.part-done-toggle {
  margin-top: 0.4rem;
  padding-top: 0.4rem;
  border-top: 1px solid var(--border);
  font-weight: 600;
  font-size: 0.8rem;
}

small,
.muted {
  color: var(--text-muted);
  font-size: 0.72rem;
}

.invite-form,
.transfer-form {
  display: grid;
  gap: 0.4rem;
  padding: 0.5rem 0.55rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-soft);
}

.transfer-form {
  margin-top: 0.55rem;
}

.transfer-form h3 {
  margin: 0;
}

.transfer-form p {
  margin: 0;
}

.invite-form label:not(.check),
.transfer-form label {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  color: var(--text-muted);
  font-size: 0.72rem;
  font-weight: 600;
}

select,
.new-link input {
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.3rem 0.45rem;
  background: var(--surface-2);
  color: var(--text);
  font: inherit;
  font-size: 0.8rem;
}

.check {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
}

button {
  border-radius: 6px;
  padding: 0.3rem 0.55rem;
  font: inherit;
  font-size: 0.78rem;
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
  margin-top: 0.45rem;
  padding: 0.45rem 0.5rem;
  border-radius: 8px;
  background: var(--surface-2);
}

.new-link p {
  margin: 0 0 0.3rem;
  color: var(--text-muted);
  font-size: 0.72rem;
}

.new-link > div {
  gap: 0.3rem;
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
  margin-top: 0.45rem;
}

.invites li {
  justify-content: space-between;
  gap: 0.45rem;
  padding: 0.35rem 0;
  border-bottom: 1px solid var(--border);
}

.danger {
  border: 0;
  background: transparent;
  color: var(--danger);
}

.status {
  color: var(--text-muted);
  font-size: 0.72rem;
}

.error {
  color: var(--danger);
  font-size: 0.8rem;
}
</style>
