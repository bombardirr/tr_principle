import { createApp, h, nextTick, reactive } from 'vue'
import { createI18n } from 'vue-i18n'
import { afterEach, describe, expect, it, vi } from 'vitest'
import JobMemoriesPanel from '../../src/components/JobMemoriesPanel.vue'

const resource = {
  kind: 'job_tm' as const,
  enabled: true,
  canRead: true,
  canWrite: true,
  canExport: false,
  canClone: false,
  preset: { canRead: true, canWrite: true, canExport: false, canClone: false },
}

const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  patchPreset: vi.fn(),
  patchMe: vi.fn(),
  sync: vi.fn(),
}))

vi.mock('../../src/jobs/resources', () => ({
  loadJobResource: mocks.load,
  jobTmReadable: (value: typeof resource | null) => Boolean(value?.enabled && value.canRead),
  jobTmWritable: (value: typeof resource | null) => Boolean(value?.enabled && value.canWrite),
}))
vi.mock('../../src/jobs/tmApi', () => ({
  patchJobResourcePreset: mocks.patchPreset,
  patchJobResourceMe: mocks.patchMe,
}))
vi.mock('../../src/jobs/tmSync', () => ({ syncJobTm: mocks.sync }))

const mounted: { unmount: () => void; host: HTMLElement }[] = []

function mountPanel(props = { jobId: 'job-1', isOwner: false, myRole: 'translator' as const }) {
  const state = reactive(props)
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(JobMemoriesPanel, state) })
  app.use(createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false }))
  app.mount(host)
  mounted.push({
    host,
    unmount: () => {
      app.unmount()
      host.remove()
    },
  })
  return host
}

afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount()
  vi.clearAllMocks()
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
})

describe('JobMemoriesPanel', () => {
  it('patches the owner preset and syncs when enabling job TM', async () => {
    mocks.load.mockResolvedValue({ ...resource, enabled: false })
    mocks.patchPreset.mockResolvedValue(resource)
    const host = mountPanel({ jobId: 'job-1', isOwner: true, myRole: 'owner' })
    await nextTick()

    host.querySelector<HTMLInputElement>('[data-testid="job-tm-read"]')!.click()
    await nextTick()

    expect(mocks.patchPreset).toHaveBeenCalledWith('job-1', { enabled: true, canRead: true })
    expect(mocks.sync).toHaveBeenCalledWith('job-1')
  })

  it('keeps translator writes disabled when the preset denies writing', async () => {
    mocks.load.mockResolvedValue({
      ...resource,
      preset: { ...resource.preset, canWrite: false },
      canWrite: false,
    })
    const host = mountPanel()
    await nextTick()

    expect(host.querySelector<HTMLInputElement>('[data-testid="job-tm-write"]')!.disabled).toBe(
      true
    )
  })

  it('does not patch while offline and shows a network error', async () => {
    mocks.load.mockResolvedValue(resource)
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    const host = mountPanel()
    await nextTick()

    host.querySelector<HTMLInputElement>('[data-testid="job-tm-read"]')!.click()
    await nextTick()

    expect(mocks.patchMe).not.toHaveBeenCalled()
    expect(host.textContent).toContain('jobs.memoriesNeedNetwork')
  })
})
