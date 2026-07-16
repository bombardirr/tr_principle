import { createApp, h, nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import { useOnlineStatus } from '@/composables/useOnlineStatus'

const mounted: { unmount: () => void }[] = []

afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount()
})

describe('useOnlineStatus', () => {
  it('starts online and flips on offline/online events', async () => {
    let current = true
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      get: () => current,
    })

    let online = true
    const host = document.createElement('div')
    document.body.append(host)
    const app = createApp({
      setup() {
        const status = useOnlineStatus()
        online = status.online.value
        return () => h('span', String(status.online.value))
      },
    })
    app.mount(host)
    mounted.push({
      unmount: () => {
        app.unmount()
        host.remove()
      },
    })
    await nextTick()
    expect(host.textContent).toBe('true')

    current = false
    window.dispatchEvent(new Event('offline'))
    await nextTick()
    expect(host.textContent).toBe('false')

    current = true
    window.dispatchEvent(new Event('online'))
    await nextTick()
    expect(host.textContent).toBe('true')
  })
})
