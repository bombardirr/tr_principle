import { createI18n } from 'vue-i18n'
import ru from './locales/ru'
import en from './locales/en'

const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('ui-locale') : null

export const i18n = createI18n({
  legacy: false,
  locale: saved === 'en' ? 'en' : 'ru',
  fallbackLocale: 'ru',
  messages: { ru, en },
})

export function setLocale(locale: 'ru' | 'en') {
  ;(i18n.global.locale as unknown as { value: string }).value = locale
  localStorage.setItem('ui-locale', locale)
  syncDocumentTitle()
}

export function syncDocumentTitle() {
  if (typeof document === 'undefined') return
  document.title = String(i18n.global.t('app.name'))
}
