<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuth } from '@/auth/session'

const { t } = useI18n()
const router = useRouter()
const { isAuthenticated, isPro } = useAuth()

const periods = [
  { id: '1m', discount: null as string | null },
  { id: '3m', discount: '~10%' },
  { id: '6m', discount: '~17%' },
  { id: '12m', discount: '~20%' },
] as const

function goActivate() {
  if (!isAuthenticated.value) {
    void router.push({ name: 'landing' })
    return
  }
  void router.push({ name: 'projects', query: { settings: 'account' } })
}
</script>

<template>
  <div class="pro-page">
    <h1>{{ t('pro.title') }}</h1>
    <p class="lead">{{ t('pro.lead') }}</p>
    <p class="as-is">{{ t('pro.asIs') }}</p>

    <section class="block">
      <h2>{{ t('pro.whatTitle') }}</h2>
      <ul>
        <li>{{ t('pro.whatCloud') }}</li>
        <li>{{ t('pro.whatLocal') }}</li>
      </ul>
    </section>

    <section class="block">
      <h2>{{ t('pro.periodsTitle') }}</h2>
      <ul class="periods">
        <li v-for="p in periods" :key="p.id">
          <strong>{{ t(`pro.period.${p.id}`) }}</strong>
          <span v-if="p.discount" class="disc">{{ t('pro.discount', { pct: p.discount }) }}</span>
          <span class="price">{{ t(`pro.price.${p.id}`) }}</span>
        </li>
      </ul>
      <p class="hint">{{ t('pro.howPay') }}</p>
    </section>

    <section class="block">
      <h2>{{ t('pro.activateTitle') }}</h2>
      <p>{{ t('pro.activateHint') }}</p>
      <button type="button" class="primary" @click="goActivate">
        {{ isPro ? t('pro.extendCta') : t('pro.activateCta') }}
      </button>
    </section>

    <p class="back">
      <router-link :to="isAuthenticated ? '/projects' : '/'">{{ t('pro.back') }}</router-link>
    </p>
  </div>
</template>

<style scoped>
.pro-page {
  max-width: 36rem;
  margin: 0 auto;
  padding: 2rem 1.25rem 3rem;
  color: var(--text);
}
h1 {
  font-size: 1.75rem;
  margin: 0 0 0.75rem;
}
.lead {
  margin: 0 0 0.75rem;
  line-height: 1.45;
  color: var(--muted);
}
.as-is {
  margin: 0 0 1.5rem;
  padding: 0.75rem 1rem;
  border-left: 3px solid var(--accent, #5b9fd4);
  background: color-mix(in srgb, var(--accent, #5b9fd4) 12%, transparent);
  font-size: 0.9rem;
  line-height: 1.4;
}
.block {
  margin-bottom: 1.75rem;
}
.block h2 {
  font-size: 1.1rem;
  margin: 0 0 0.5rem;
}
.block ul {
  margin: 0;
  padding-left: 1.2rem;
  line-height: 1.5;
}
.periods {
  list-style: none;
  padding: 0;
}
.periods li {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  align-items: baseline;
  padding: 0.55rem 0;
  border-bottom: 1px solid color-mix(in srgb, var(--text) 12%, transparent);
}
.disc {
  font-size: 0.85rem;
  color: var(--muted);
}
.price {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}
.hint {
  margin: 0.75rem 0 0;
  font-size: 0.9rem;
  color: var(--muted);
  line-height: 1.4;
}
.primary {
  margin-top: 0.75rem;
  border: none;
  border-radius: 8px;
  padding: 0.55rem 1rem;
  background: var(--accent, #5b9fd4);
  color: #0f1419;
  font-weight: 600;
  cursor: pointer;
}
.back {
  margin-top: 2rem;
}
.back a {
  color: var(--accent, #5b9fd4);
}
</style>
