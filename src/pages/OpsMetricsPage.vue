<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { apiBase, getStoredToken } from '@/auth/api'
import { useAuth } from '@/auth/session'

const { t } = useI18n()
const router = useRouter()
const { user, isAuthenticated } = useAuth()

const body = ref('')
const error = ref('')
const busy = ref(false)

async function load() {
  error.value = ''
  body.value = ''
  if (!isAuthenticated.value) {
    await router.replace({ name: 'landing', query: { next: '/ops/metrics' } })
    return
  }
  if (!user.value?.is_admin) {
    error.value = t('ops.metricsForbidden')
    return
  }
  const token = getStoredToken()
  if (!token) {
    error.value = t('ops.metricsForbidden')
    return
  }
  busy.value = true
  try {
    const res = await fetch(`${apiBase()}/metrics`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.status === 403) {
      error.value = t('ops.metricsForbidden')
      return
    }
    if (!res.ok) {
      error.value = t('ops.metricsLoadError', { status: res.status })
      return
    }
    body.value = await res.text()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="ops-metrics">
    <header class="ops-head">
      <h1>{{ t('ops.metricsTitle') }}</h1>
      <div class="ops-actions">
        <button type="button" class="ghost" :disabled="busy" @click="router.push({ name: 'projects' })">
          {{ t('ops.metricsBack') }}
        </button>
        <button type="button" class="primary" :disabled="busy || !user?.is_admin" @click="load">
          {{ t('ops.metricsRefresh') }}
        </button>
      </div>
    </header>
    <p class="ops-hint">{{ t('ops.metricsHint') }}</p>
    <p v-if="error" class="ops-error" role="alert">{{ error }}</p>
    <pre v-else-if="body" class="ops-body">{{ body }}</pre>
    <p v-else-if="busy" class="ops-hint">{{ t('ops.metricsLoading') }}</p>
  </div>
</template>

<style scoped lang="scss">
.ops-metrics {
  max-width: 960px;
  margin: 0 auto;
  padding: 1rem 0 2rem;
}

.ops-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.ops-head h1 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
}

.ops-actions {
  display: flex;
  gap: 0.4rem;
}

.ops-actions .ghost,
.ops-actions .primary {
  border-radius: 6px;
  padding: 0.35rem 0.7rem;
  cursor: pointer;
  border: 1px solid transparent;
  font-size: 0.8rem;
  font-weight: 600;
}

.ops-actions .ghost {
  background: transparent;
  color: var(--text);
  border-color: var(--border-strong);
}

.ops-actions .primary {
  background: var(--accent);
  color: var(--accent-text);
  border-color: var(--accent-strong);
}

.ops-actions button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ops-hint {
  margin: 0 0 0.75rem;
  font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.45;
}

.ops-error {
  margin: 0;
  color: var(--danger);
  font-size: 0.9rem;
}

.ops-body {
  margin: 0;
  padding: 0.85rem 1rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface-2, var(--bg));
  color: var(--text);
  font-size: 0.72rem;
  line-height: 1.4;
  overflow: auto;
  max-height: calc(100vh - 12rem);
  white-space: pre;
}
</style>
