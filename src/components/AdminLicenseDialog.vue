<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  ApiError,
  adminCreateLicense,
  adminListLicenses,
  adminPatchLicenseNote,
  adminRevokeLicense,
  type LicenseKeyRow,
  type LicenseKeyStats,
} from '@/auth/api'

const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()

const skus = ['pro_1m', 'pro_3m', 'pro_6m', 'pro_12m'] as const
const sku = ref<(typeof skus)[number]>('pro_1m')
const note = ref('')
const busy = ref(false)
const error = ref('')
const keys = ref<LicenseKeyRow[]>([])
const stats = ref<LicenseKeyStats>({ total: 0, unused: 0, redeemed: 0, revoked: 0 })
const lastKey = ref('')
const copied = ref(false)

const hasKeys = computed(() => keys.value.length > 0)

async function reload() {
  busy.value = true
  error.value = ''
  try {
    const res = await adminListLicenses()
    keys.value = res.keys ?? []
    stats.value = res.stats
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function onGenerate() {
  busy.value = true
  error.value = ''
  copied.value = false
  try {
    const row = await adminCreateLicense(sku.value, note.value.trim())
    lastKey.value = row.key ?? ''
    note.value = ''
    await reload()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function onCopy() {
  if (!lastKey.value) return
  try {
    await navigator.clipboard.writeText(lastKey.value)
    copied.value = true
  } catch {
    error.value = t('auth.licenseAdminCopyFail')
  }
}

async function onRevoke(row: LicenseKeyRow) {
  if (row.status === 'revoked') return
  const msg =
    row.status === 'redeemed'
      ? t('auth.licenseAdminRevokeRedeemedConfirm', {
          hint: row.key_hint,
          email: row.redeemed_email || '—',
        })
      : t('auth.licenseAdminRevokeConfirm', { hint: row.key_hint })
  if (!window.confirm(msg)) return
  busy.value = true
  error.value = ''
  try {
    await adminRevokeLicense(row.key_hash)
    await reload()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

async function onSaveNote(row: LicenseKeyRow, value: string) {
  busy.value = true
  error.value = ''
  try {
    await adminPatchLicenseNote(row.key_hash, value)
    row.note = value.trim()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e)
  } finally {
    busy.value = false
  }
}

function statusLabel(status: string) {
  if (status === 'unused') return t('auth.licenseStatusUnused')
  if (status === 'redeemed') return t('auth.licenseStatusRedeemed')
  if (status === 'revoked') return t('auth.licenseStatusRevoked')
  return status
}

function skuLabel(s: string) {
  return t(`auth.licenseSku.${s}` as 'auth.licenseSku.pro_1m')
}

function fmtDate(iso?: string) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

onMounted(() => {
  void reload()
})
</script>

<template>
  <div class="dlg-backdrop" @click.self="emit('close')">
    <div class="dlg" role="dialog" :aria-label="t('auth.licenseAdminTitle')">
      <header class="dlg-head">
        <h2>{{ t('auth.licenseAdminTitle') }}</h2>
        <button type="button" class="ghost" @click="emit('close')">{{ t('auth.licenseAdminClose') }}</button>
      </header>

      <p class="hint">{{ t('auth.licenseAdminHint') }}</p>

      <div class="stats" aria-live="polite">
        <span>{{ t('auth.licenseAdminStatTotal', { n: stats.total }) }}</span>
        <span>{{ t('auth.licenseAdminStatUnused', { n: stats.unused }) }}</span>
        <span>{{ t('auth.licenseAdminStatRedeemed', { n: stats.redeemed }) }}</span>
        <span>{{ t('auth.licenseAdminStatRevoked', { n: stats.revoked }) }}</span>
      </div>

      <div class="gen">
        <label>
          <span>{{ t('auth.licenseAdminSku') }}</span>
          <select v-model="sku" :disabled="busy">
            <option v-for="s in skus" :key="s" :value="s">{{ skuLabel(s) }}</option>
          </select>
        </label>
        <label class="grow">
          <span>{{ t('auth.licenseAdminNote') }}</span>
          <input v-model="note" type="text" maxlength="200" :disabled="busy" :placeholder="t('auth.licenseAdminNotePh')" />
        </label>
        <button type="button" class="primary" :disabled="busy" @click="onGenerate">
          {{ t('auth.licenseAdminGenerate') }}
        </button>
      </div>

      <div v-if="lastKey" class="last-key">
        <p class="ok">{{ t('auth.licenseAdminOnce') }}</p>
        <code>{{ lastKey }}</code>
        <button type="button" class="ghost" @click="onCopy">
          {{ copied ? t('auth.licenseAdminCopied') : t('auth.licenseAdminCopy') }}
        </button>
      </div>

      <p v-if="error" class="err" role="alert">{{ error }}</p>

      <div class="table-wrap">
        <table v-if="hasKeys">
          <thead>
            <tr>
              <th>{{ t('auth.licenseAdminColHint') }}</th>
              <th>{{ t('auth.licenseAdminColSku') }}</th>
              <th>{{ t('auth.licenseAdminColStatus') }}</th>
              <th>{{ t('auth.licenseAdminColCreated') }}</th>
              <th>{{ t('auth.licenseAdminColRedeemed') }}</th>
              <th>{{ t('auth.licenseAdminColNote') }}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in keys" :key="row.key_hash">
              <td><code>{{ row.key_hint }}</code></td>
              <td>{{ skuLabel(row.sku) }}</td>
              <td>
                <span class="st" :data-st="row.status">{{ statusLabel(row.status) }}</span>
              </td>
              <td>{{ fmtDate(row.created_at) }}</td>
              <td>
                <template v-if="row.status === 'redeemed'">
                  {{ row.redeemed_email || '—' }}
                  <br />
                  <small>{{ fmtDate(row.redeemed_at) }}</small>
                </template>
                <template v-else>—</template>
              </td>
              <td>
                <input
                  class="note-in"
                  :value="row.note"
                  maxlength="200"
                  :disabled="busy"
                  @change="onSaveNote(row, ($event.target as HTMLInputElement).value)"
                />
              </td>
              <td>
                <button
                  v-if="row.status === 'unused' || row.status === 'redeemed'"
                  type="button"
                  class="ghost danger"
                  :disabled="busy"
                  @click="onRevoke(row)"
                >
                  {{ t('auth.licenseAdminRevoke') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else-if="!busy" class="hint">{{ t('auth.licenseAdminEmpty') }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dlg-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.55);
}
.dlg {
  width: min(960px, 100%);
  max-height: min(90vh, 820px);
  overflow: auto;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  padding: 1rem 1.1rem 1.25rem;
}
.dlg-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}
.dlg-head h2 {
  margin: 0;
  font-size: 1.1rem;
}
.hint {
  margin: 0 0 0.75rem;
  font-size: 0.85rem;
  color: var(--muted);
  line-height: 1.4;
}
.stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  margin-bottom: 0.85rem;
  font-size: 0.82rem;
  color: var(--muted);
}
.gen {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: flex-end;
  margin-bottom: 0.85rem;
}
.gen label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.78rem;
  color: var(--muted);
}
.gen .grow {
  flex: 1 1 12rem;
}
.gen select,
.gen input,
.note-in {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg, #0f1419);
  color: var(--text);
  padding: 0.4rem 0.5rem;
  font: inherit;
}
.primary,
.ghost {
  border-radius: 8px;
  padding: 0.45rem 0.75rem;
  font: inherit;
  cursor: pointer;
}
.primary {
  border: none;
  background: var(--accent, #5b9fd4);
  color: #0f1419;
  font-weight: 600;
}
.ghost {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text);
}
.ghost.danger {
  color: #e07070;
  border-color: color-mix(in srgb, #e07070 40%, var(--border));
}
.last-key {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
  margin-bottom: 0.75rem;
  padding: 0.65rem 0.75rem;
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent, #5b9fd4) 12%, transparent);
}
.last-key .ok {
  margin: 0;
  width: 100%;
  font-size: 0.85rem;
}
.last-key code {
  font-size: 0.9rem;
  word-break: break-all;
}
.err {
  color: #e07070;
  font-size: 0.85rem;
}
.table-wrap {
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}
th,
td {
  text-align: left;
  padding: 0.4rem 0.35rem;
  border-bottom: 1px solid color-mix(in srgb, var(--text) 10%, transparent);
  vertical-align: top;
}
.st[data-st='unused'] {
  color: var(--accent, #5b9fd4);
}
.st[data-st='redeemed'] {
  color: #6cbc7a;
}
.st[data-st='revoked'] {
  color: #e07070;
}
.note-in {
  width: 100%;
  min-width: 7rem;
}
small {
  color: var(--muted);
}
</style>
