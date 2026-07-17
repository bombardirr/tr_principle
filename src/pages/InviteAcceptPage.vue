<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { acceptProjectInvite } from '@/projects/collabApi'
import { fetchSharedProject } from '@/projects/collabSync'
import { saveProject } from '@/storage/idb'

const props = defineProps<{ token: string }>()
const router = useRouter()
const { t } = useI18n()
const error = ref('')

onMounted(async () => {
  try {
    const accepted = await acceptProjectInvite(props.token)
    const record = await fetchSharedProject(accepted.projectId)
    await saveProject(record)
    await router.replace({ name: 'editor', params: { id: accepted.projectId } })
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
})
</script>

<template>
  <main class="invite-accept">
    <section class="card" aria-live="polite">
      <h1>{{ t('invites.acceptTitle') }}</h1>
      <p v-if="!error">{{ t('invites.accepting') }}</p>
      <template v-else>
        <p class="error">{{ t('invites.acceptError') }}</p>
        <p class="details">{{ error }}</p>
        <RouterLink :to="{ name: 'projects' }">{{ t('invites.goProjects') }}</RouterLink>
      </template>
    </section>
  </main>
</template>

<style scoped lang="scss">
.invite-accept {
  display: grid;
  min-height: 60vh;
  place-items: center;
  padding: 1rem;
}

.card {
  width: min(28rem, 100%);
  padding: 1.5rem;
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
}

h1,
p {
  margin: 0;
}

p {
  margin-top: 0.6rem;
  color: var(--text-muted);
}

.error {
  color: #c53b3b;
}

.details {
  font-size: 0.86rem;
}

a {
  display: inline-block;
  margin-top: 1rem;
  color: var(--accent);
}
</style>
