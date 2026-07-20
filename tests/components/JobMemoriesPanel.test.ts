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
})
