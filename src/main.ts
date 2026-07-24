import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { i18n, syncDocumentTitle } from './i18n'
import { initTheme } from './theme'
import { initMetrika } from '@/analytics/metrika'
import './fonts'
import './style.css'

initTheme()
syncDocumentTitle()
initMetrika()

createApp(App).use(router).use(i18n).mount('#app')
