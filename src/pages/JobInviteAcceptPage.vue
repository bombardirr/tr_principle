<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { acceptInvite } from '@/jobs/api'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const busy = ref(false)
const error = ref('')

const token = computed(() => String(route.params.token ?? '').trim())

async function join() {
  if (!token.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    const accepted = await acceptInvite({ token: token.value })
    await router.push({ name: 'projects', query: { job: accepted.jobId } })
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="invite-page">
    <div class="card">
      <p class="eyebrow">{{ t('jobs.sharedWork') }}</p>
      <h1>{{ t('jobs.joinTitle') }}</h1>
      <p class="lead">{{ t('jobs.joinHint') }}</p>

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <div class="actions">
        <router-link class="cancel" to="/projects">{{ t('jobs.cancel') }}</router-link>
        <button type="button" class="primary" :disabled="busy || !token" @click="join">
          {{ busy ? t('jobs.joining') : t('jobs.joinMembership') }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.invite-page {
  display: grid;
  min-height: calc(100vh - 7rem);
  place-items: center;
  padding: 2rem 1rem;
}

.card {
  width: min(34rem, 100%);
  padding: clamp(1.25rem, 4vw, 2rem);
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.12);
}

.eyebrow {
  margin: 0 0 0.35rem;
  color: var(--accent);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  font-size: 1.6rem;
}

.lead {
  color: var(--text-muted);
  font-size: 0.88rem;
  line-height: 1.45;
}

.actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.6rem;
  margin-top: 1.25rem;
}

button,
.cancel {
  border-radius: 8px;
  padding: 0.52rem 0.9rem;
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}

button:disabled {
  cursor: default;
  opacity: 0.55;
}

.primary {
  border: 0;
  background: var(--accent);
  color: #fff;
}

.cancel {
  color: var(--text-muted);
}

.error {
  color: var(--danger);
}
</style>
