<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/auth/session'
import {
  createProjectInvite,
  getCloudProject,
  listProjectInvites,
  listProjectMembers,
  removeProjectMember,
  revokeProjectInvite,
  type ProjectInvite,
  type ProjectMember,
} from '@/projects/collabApi'

const props = defineProps<{ open: boolean; projectId: string }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const { user } = useAuth()

const members = ref<ProjectMember[]>([])
const invites = ref<ProjectInvite[]>([])
const isOwner = ref(false)
const busy = ref(false)
const error = ref('')
const copiedInviteId = ref('')
const latestInvite = ref<{ id: string; link: string } | null>(null)
const inviteKind = ref<'open' | 'burning' | 'ttl'>('burning')
const inviteRole = ref<'editor' | 'viewer'>('editor')
const expiresAt = ref('')

const activeInvites = computed(() => invites.value.filter(invite => !invite.revokedAt))
const openInvites = computed(() =>
  activeInvites.value.filter(invite => !invite.maxUses && !invite.expiresAt),
)
const burningInvites = computed(() =>
  activeInvites.value.filter(invite => invite.maxUses === 1 && !invite.expiresAt),
)
const ttlInvites = computed(() => activeInvites.value.filter(invite => !!invite.expiresAt))

function formatDate(value: string) {
  return new Date(value).toLocaleString()
}

function inviteSummary(invite: ProjectInvite) {
  if (invite.expiresAt) return t('invites.expiresAt', { date: formatDate(invite.expiresAt) })
  if (invite.maxUses === 1) return t('invites.burning')
  if (invite.maxUses) return t('invites.uses', { used: invite.usesCount, max: invite.maxUses })
  return t('invites.open')
}

function selectInviteLink(event: FocusEvent) {
  ;(event.target as HTMLInputElement).select()
}

async function refresh() {
  if (!props.open) return
  busy.value = true
  error.value = ''
  try {
    const [project, memberData] = await Promise.all([
      getCloudProject(props.projectId),
      listProjectMembers(props.projectId),
    ])
    isOwner.value = project.ownerUserId === user.value?.id
    members.value = memberData.members
    invites.value = isOwner.value ? (await listProjectInvites(props.projectId)).invites : []
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

watch(() => [props.open, props.projectId], refresh, { immediate: true })

async function copyInvite(inviteId: string, link: string) {
  try {
    await navigator.clipboard.writeText(link)
    copiedInviteId.value = inviteId
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

async function createInvite() {
  const payload: { role: 'editor' | 'viewer'; maxUses?: number; expiresAt?: string } = {
    role: inviteRole.value,
  }
  if (inviteKind.value === 'burning') payload.maxUses = 1
  if (inviteKind.value === 'ttl') {
    if (!expiresAt.value) {
      error.value = t('invites.expiryRequired')
      return
    }
    payload.expiresAt = new Date(expiresAt.value).toISOString()
  }
  busy.value = true
  error.value = ''
  try {
    const { invite, token } = await createProjectInvite(props.projectId, payload)
    invites.value = [invite, ...invites.value]
    latestInvite.value = {
      id: invite.id,
      link: `${window.location.origin}/invite/${token}`,
    }
    await copyInvite(invite.id, latestInvite.value.link)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function revokeInvite(inviteId: string) {
  busy.value = true
  try {
    const invite = await revokeProjectInvite(props.projectId, inviteId)
    invites.value = invites.value.map(item => (item.id === invite.id ? invite : item))
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function removeMember(member: ProjectMember) {
  if (!window.confirm(t('invites.removeConfirm', { name: member.displayName }))) return
  busy.value = true
  try {
    await removeProjectMember(props.projectId, member.userId)
    members.value = members.value.filter(item => item.userId !== member.userId)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="open" class="backdrop" role="presentation" @click.self="emit('close')">
    <section class="panel" role="dialog" aria-modal="true" :aria-label="t('invites.title')">
      <header>
        <h2>{{ t('invites.title') }}</h2>
        <button type="button" class="close" :aria-label="t('invites.close')" @click="emit('close')">×</button>
      </header>

      <p v-if="error" class="error">{{ error }}</p>

      <template v-if="isOwner">
        <form class="invite-form" @submit.prevent="createInvite">
          <label>
            <span>{{ t('invites.linkType') }}</span>
            <select v-model="inviteKind">
              <option value="open">{{ t('invites.open') }}</option>
              <option value="burning">{{ t('invites.burning') }}</option>
              <option value="ttl">{{ t('invites.ttl') }}</option>
            </select>
          </label>
          <label>
            <span>{{ t('invites.role') }}</span>
            <select v-model="inviteRole">
              <option value="editor">{{ t('invites.editor') }}</option>
              <option value="viewer">{{ t('invites.viewer') }}</option>
            </select>
          </label>
          <label v-if="inviteKind === 'ttl'">
            <span>{{ t('invites.expires') }}</span>
            <input v-model="expiresAt" type="datetime-local" />
          </label>
          <button class="primary" type="submit" :disabled="busy">{{ t('invites.create') }}</button>
        </form>
        <div v-if="latestInvite" class="latest-invite">
          <span>{{ t('invites.latestLink') }}</span>
          <input :value="latestInvite.link" readonly @focus="selectInviteLink" />
          <button type="button" @click="copyInvite(latestInvite.id, latestInvite.link)">
            {{ copiedInviteId === latestInvite.id ? t('invites.copied') : t('invites.copyLink') }}
          </button>
        </div>

        <div v-for="group in [
          { key: 'open', items: openInvites },
          { key: 'burning', items: burningInvites },
          { key: 'ttl', items: ttlInvites },
        ]" :key="group.key" class="invite-group">
          <h3>{{ t(`invites.${group.key}Invites`) }}</h3>
          <p v-if="!group.items.length" class="empty">{{ t('invites.noInvites') }}</p>
          <article v-for="invite in group.items" :key="invite.id" class="invite-row">
            <span>{{ inviteSummary(invite) }} · {{ t(`invites.${invite.role}`) }}</span>
            <div class="row-actions">
              <button type="button" @click="revokeInvite(invite.id)">{{ t('invites.revoke') }}</button>
            </div>
          </article>
        </div>
      </template>

      <h3>{{ t('invites.members') }}</h3>
      <p v-if="!members.length && !busy" class="empty">{{ t('invites.noMembers') }}</p>
      <article v-for="member in members" :key="member.userId" class="member-row">
        <span>{{ member.displayName || t('invites.unnamedMember') }}</span>
        <span class="role">{{ t(`invites.${member.role}`) }}</span>
        <button
          v-if="isOwner && member.userId !== user?.id"
          type="button"
          class="danger"
          :disabled="busy"
          @click="removeMember(member)"
        >
          {{ t('invites.remove') }}
        </button>
      </article>
    </section>
  </div>
</template>

<style scoped lang="scss">
.backdrop { position: fixed; inset: 0; z-index: 80; display: grid; place-items: center; padding: 1rem; background: color-mix(in srgb, #000 45%, transparent); }
.panel { width: min(38rem, 100%); max-height: min(44rem, 90vh); overflow: auto; padding: 1.25rem; border-radius: 12px; background: var(--surface); color: var(--text); box-shadow: 0 16px 48px rgba(0, 0, 0, .28); }
header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
h2, h3 { margin: 0; } h3 { margin-top: 1.25rem; font-size: .92rem; }
.close { border: 0; background: transparent; color: var(--text); font-size: 1.5rem; cursor: pointer; }
.invite-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .7rem; margin-top: 1rem; }
label { display: grid; gap: .3rem; font-size: .78rem; color: var(--text-muted); }
select, input, button { font: inherit; } select, input { min-width: 0; border: 1px solid var(--border); border-radius: 7px; padding: .5rem; background: var(--surface-2); color: var(--text); }
.primary { align-self: end; border: 0; border-radius: 7px; padding: .5rem .75rem; background: var(--accent); color: #fff; font-weight: 600; cursor: pointer; }
.latest-invite { display: grid; grid-template-columns: 1fr auto; gap: .45rem; align-items: center; margin-top: .8rem; font-size: .78rem; color: var(--text-muted); }
.latest-invite span { grid-column: 1 / -1; } .latest-invite button { border: 0; border-radius: 7px; padding: .5rem .75rem; background: var(--surface-2); color: var(--text); cursor: pointer; }
.invite-group { margin-top: .2rem; }
.invite-row, .member-row { display: flex; align-items: center; gap: .65rem; padding: .55rem 0; border-bottom: 1px solid var(--border); font-size: .88rem; }
.row-actions { margin-left: auto; } .role { color: var(--text-muted); margin-left: auto; }
.invite-row button, .danger { border: 0; border-radius: 6px; padding: .3rem .5rem; background: var(--surface-2); color: var(--text); cursor: pointer; }
.danger { margin-left: .3rem; color: #c53b3b; } .empty { margin: .5rem 0; color: var(--text-muted); font-size: .85rem; }
.error { color: #c53b3b; font-size: .85rem; }
@media (max-width: 440px) { .invite-form { grid-template-columns: 1fr; } }
</style>
