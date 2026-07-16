import { createApp, h, nextTick, reactive } from 'vue'
import { createI18n } from 'vue-i18n'
import { afterEach, describe, expect, it } from 'vitest'
import StyleToolbar from '../../src/components/StyleToolbar.vue'

const mounted: { unmount: () => void; host: HTMLElement }[] = []

function mountToolbar(overrides: Record<string, unknown> = {}) {
  const props = reactive({
    fonts: ['Arial'],
    hasSelection: true,
    disabled: false,
    ...overrides,
  })
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(StyleToolbar, props) })
  app.use(
    createI18n({
      legacy: false,
      locale: 'en',
      messages: { en: {} },
      missingWarn: false,
      fallbackWarn: false,
    }),
  )
  app.mount(host)
  mounted.push({
    host,
    unmount: () => {
      app.unmount()
      host.remove()
    },
  })
  return { host, props }
}

afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount()
})

describe('StyleToolbar pointer behavior', () => {
  it('does not prevent native select mousedown', () => {
    const { host } = mountToolbar()
    const select = host.querySelector('select')
    expect(select).not.toBeNull()

    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    select!.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
  })

  it('keeps button mousedown from clearing the editor selection', () => {
    const { host } = mountToolbar()
    const button = host.querySelector<HTMLButtonElement>('.icon-btn')
    expect(button).not.toBeNull()

    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    button!.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })

  it('closes an open picker when the selection becomes unavailable', async () => {
    const { host, props } = mountToolbar()
    host.querySelector<HTMLButtonElement>('.color-trigger')!.click()
    await nextTick()
    expect(host.querySelector('.palette-panel')).not.toBeNull()

    props.hasSelection = false
    await nextTick()

    expect(host.querySelector('.palette-panel')).toBeNull()
  })
})
