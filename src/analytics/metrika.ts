/** Product analytics via Yandex Metrica. No PII in goals/params. */

declare global {
  interface Window {
    ym?: ((...args: unknown[]) => void) & { a?: unknown[][]; l?: number }
  }
}

const idRaw = (import.meta.env.VITE_YANDEX_METRIKA_ID as string | undefined)?.trim() ?? ''
const counterId = /^\d+$/.test(idRaw) ? Number(idRaw) : null

export type MetrikaGoal = 'register' | 'login' | 'project_open' | 'export_docx'

export function isMetrikaEnabled(): boolean {
  return counterId != null
}

export function getMetrikaCounterId(): number | null {
  return counterId
}

function ym(...args: unknown[]) {
  if (counterId == null || typeof window === 'undefined') return
  if (typeof window.ym === 'function') {
    window.ym(...args)
  }
}

/** Inject tag.js once and init the counter. */
export function initMetrika(): void {
  if (counterId == null || typeof document === 'undefined') return
  if (document.getElementById('yandex-metrika-script')) return

  type YmFn = ((...args: unknown[]) => void) & { a?: unknown[][]; l?: number }
  const w = window as Window & { ym?: YmFn }
  w.ym =
    w.ym ||
    (function (...args: unknown[]) {
      ;(w.ym!.a = w.ym!.a || []).push(args)
    } as YmFn)
  w.ym.l = Date.now()

  const src = `https://mc.yandex.ru/metrika/tag.js?id=${counterId}`
  for (let i = 0; i < document.scripts.length; i++) {
    if (document.scripts[i]!.src === src) return
  }
  const s = document.createElement('script')
  s.id = 'yandex-metrika-script'
  s.async = true
  s.src = src
  const first = document.getElementsByTagName('script')[0]
  first?.parentNode?.insertBefore(s, first)

  ym(counterId, 'init', {
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: false,
  })
}

export function metrikaHit(url: string, opts?: { title?: string; referer?: string }): void {
  if (counterId == null) return
  ym(counterId, 'hit', url, {
    title: opts?.title,
    referer: opts?.referer,
  })
}

export function metrikaGoal(goal: MetrikaGoal): void {
  if (counterId == null) return
  ym(counterId, 'reachGoal', goal)
}
