import { createApp, h, nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import { afterEach, describe, expect, it } from 'vitest'
import JobMemoriesPanel from '../../src/components/JobMemoriesPanel.vue'

const messages = {
  en: {
    jobs: {
      memoriesTitle: 'Memories',
      memoriesPersonal: 'Personal TM',
      memoriesPersonalHint: 'always · only you',
      memoriesAttachedTitle: 'Attached TMs',
      memoriesAttachedEmpty: 'No TMs attached yet. Attach bases to use them on this work.',
      memoriesAttach: 'Attach base',
      memoriesDetach: 'Detach base',
    },
    projects: {
      tmPersonalBase: 'Personal TM',
      tmUnitsStat: '{n} units',
    },
    tmCollection: {
      pickTitle: 'Choose a TM',
      title: 'TM collection',
      pickHint: 'Choose a base to attach.',
      hint: 'Manage your translation memories.',
      close: 'Close',
      attached: 'Attached',
      openFull: 'Open collection',
    },
  },
}

const mounted: { unmount: () => void }[] = []

function mountPanel(props = { jobId: 'job-1', isOwner: false, myRole: 'translator' as const }) {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(JobMemoriesPanel, props) })
  app.use(createI18n({ legacy: false, locale: 'en', messages, missingWarn: false }))
  app.mount(host)
  mounted.push({
    unmount: () => {
      app.unmount()
      host.remove()
    },
  })
  return host
}

afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount()
  localStorage.clear()
})

describe('JobMemoriesPanel', () => {
  it('shows personal TM and empty attached list without job TM toggles', async () => {
    const host = mountPanel()
    await nextTick()

    expect(host.textContent).toContain('Personal TM')
    expect(host.textContent).toContain('Attached TMs')
    expect(host.textContent).toContain('No TMs attached yet')
    expect(host.querySelector('[data-testid="job-tm-read"]')).toBeNull()
    expect(host.querySelector('[data-testid="job-tm-write"]')).toBeNull()
  })

  it('can attach personal TM via pick flow and see R/W controls', async () => {
    const host = mountPanel()
    await nextTick()

    const add = host.querySelector<HTMLButtonElement>('[data-testid="job-tm-add"]')
    expect(add).not.toBeNull()
    add!.click()
    await nextTick()

    const personalCard = [...host.querySelectorAll<HTMLElement>('[role="button"]')].find(card =>
      card.textContent?.includes('Personal TM')
    )
    expect(personalCard).toBeDefined()
    personalCard!.click()
    await nextTick()

    expect(host.textContent).toContain('Personal TM')
    expect(host.textContent).toContain('R')
    expect(host.textContent).toContain('W')
    expect(host.querySelector('[data-testid="job-tm-read"]')).toBeNull()
    expect(host.querySelector('[data-testid="job-tm-write"]')).toBeNull()
  })
})
