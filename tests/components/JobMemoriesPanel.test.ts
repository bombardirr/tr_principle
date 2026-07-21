import { createApp, h, nextTick, reactive } from 'vue'
import { createI18n } from 'vue-i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/jobs/tmAttachmentsApi', () => ({
  listJobTmAttachmentsApi: vi.fn(async () => []),
  createJobTmAttachment: vi.fn(
    async (_jobId: string, input: { tmBaseId: string; canRead?: boolean; canWrite?: boolean }) => ({
      id: 'att-created',
      jobId: 'job-1',
      tmBaseId: input.tmBaseId,
      canRead: input.canRead ?? true,
      canWrite: input.canWrite ?? true,
      canExport: false,
      canClone: false,
      createdBy: 'u1',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    })
  ),
  patchJobTmAttachment: vi.fn(async () => ({
    id: 'att-server',
    jobId: 'job-1',
    tmBaseId: 'personal-tm',
    canRead: false,
    canWrite: true,
    canExport: false,
    canClone: false,
    createdBy: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
  })),
  deleteJobTmAttachment: vi.fn(async () => undefined),
}))

vi.mock('../../src/storage/tmBasesIdb', () => ({
  upsertSharedTmBase: vi.fn(async () => undefined),
}))

vi.mock('../../src/tm/sync', () => ({
  syncTmBase: vi.fn(async () => undefined),
}))

import JobMemoriesPanel from '../../src/components/JobMemoriesPanel.vue'
import { upsertSharedTmBase } from '../../src/storage/tmBasesIdb'
import { syncTmBase } from '../../src/tm/sync'
import {
  createJobTmAttachment,
  deleteJobTmAttachment,
  listJobTmAttachmentsApi,
  patchJobTmAttachment,
} from '../../src/jobs/tmAttachmentsApi'

const messages = {
  en: {
    jobs: {
      memoriesTitle: 'Memories',
      memoriesPersonal: 'Personal TM',
      memoriesPersonalHint: 'always · only you',
      memoriesJobBasesTitle: 'Job bases',
      memoriesJobBasesEmpty: 'No shared bases attached yet.',
      memoriesLocalOverlayTitle: 'My extras',
      memoriesLocalOverlayEmpty: 'No local extra bases.',
      memoriesLocalOverlayHint: 'Only on this device for you',
      memoriesAttach: 'Attach base',
      memoriesDetach: 'Detach base',
    },
    projects: {
      tmPersonalBase: 'Personal TM',
      tmUnitsStat: '{n} units',
      tmPermRead: 'Read',
      tmPermWrite: 'Write',
      tmPermReadShort: 'R',
      tmPermWriteShort: 'W',
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

async function settle() {
  await nextTick()
  await nextTick()
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listJobTmAttachmentsApi).mockResolvedValue([])
  localStorage.clear()
})

afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount()
})

describe('JobMemoriesPanel', () => {
  it('shows personal, shared, and local layers', async () => {
    const host = mountPanel()
    await settle()

    expect(host.textContent).toContain('Personal TM')
    expect(host.textContent).toContain('Job bases')
    expect(host.textContent).toContain('No shared bases attached yet.')
    expect(host.textContent).toContain('My extras')
    expect(host.textContent).toContain('Only on this device for you')
    expect(host.textContent).toContain('No local extra bases.')
    expect(listJobTmAttachmentsApi).toHaveBeenCalledWith('job-1')
  })

  it('only shows the shared add control to the owner', async () => {
    const ownerHost = mountPanel({ jobId: 'job-1', isOwner: true, myRole: 'owner' })
    const memberHost = mountPanel({ jobId: 'job-1', isOwner: false, myRole: 'translator' })
    await settle()

    expect(ownerHost.querySelector('[data-testid="job-tm-add"]')).not.toBeNull()
    expect(memberHost.querySelector('[data-testid="job-tm-add"]')).toBeNull()
    expect(memberHost.querySelector('[data-testid="job-tm-local-add"]')).not.toBeNull()
  })

  it('owner attaches a shared base through the server API', async () => {
    const host = mountPanel({ jobId: 'job-1', isOwner: true, myRole: 'owner' })
    await settle()

    host.querySelector<HTMLButtonElement>('[data-testid="job-tm-add"]')!.click()
    await nextTick()
    const personalCard = [...host.querySelectorAll<HTMLElement>('[role="button"]')].find(card =>
      card.textContent?.includes('Personal TM')
    )
    personalCard!.click()
    await settle()

    expect(createJobTmAttachment).toHaveBeenCalledWith('job-1', {
      tmBaseId: 'personal-tm',
      canRead: true,
      canWrite: true,
    })
  })

  it('uses attachment UUID for shared mutations and disables member controls', async () => {
    vi.mocked(listJobTmAttachmentsApi).mockResolvedValue([
      {
        id: 'att-server',
        jobId: 'job-1',
        tmBaseId: 'personal-tm',
        canRead: true,
        canWrite: true,
        canExport: false,
        canClone: false,
        createdBy: 'u1',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ])

    const memberHost = mountPanel()
    await settle()
    const memberCheckboxes = memberHost.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    expect(memberHost.textContent).toContain('Personal TM')
    expect(memberCheckboxes).toHaveLength(2)
    expect([...memberCheckboxes].every(input => input.disabled)).toBe(true)
    expect(memberHost.querySelector('[data-testid="job-tm-shared-detach"]')).toBeNull()

    const ownerHost = mountPanel({ jobId: 'job-1', isOwner: true, myRole: 'owner' })
    await settle()
    const ownerRead = ownerHost.querySelector<HTMLInputElement>(
      '[data-testid="job-tm-shared-read"]'
    )!
    ownerRead.click()
    await settle()
    expect(patchJobTmAttachment).toHaveBeenCalledWith('job-1', 'att-server', {
      canRead: false,
    })

    ownerHost.querySelector<HTMLButtonElement>('[data-testid="job-tm-shared-detach"]')!.click()
    await settle()
    expect(deleteJobTmAttachment).toHaveBeenCalledWith('job-1', 'att-server')
  })

  it('caches and pulls each readable shared base in the job context', async () => {
    vi.mocked(listJobTmAttachmentsApi).mockResolvedValue([
      {
        id: 'att-readable',
        jobId: 'job-1',
        tmBaseId: 'shared-base',
        label: 'Shared base',
        color: '#123456',
        ownerId: 'owner-1',
        canRead: true,
        canWrite: false,
        canExport: false,
        canClone: false,
        createdBy: 'owner-1',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      {
        id: 'att-hidden',
        jobId: 'job-1',
        tmBaseId: 'hidden-base',
        canRead: false,
        canWrite: false,
        canExport: false,
        canClone: false,
        createdBy: 'owner-1',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ])

    mountPanel()

    await vi.waitFor(() => {
      expect(upsertSharedTmBase).toHaveBeenCalledWith({
        id: 'shared-base',
        label: 'Shared base',
        color: '#123456',
      })
      expect(syncTmBase).toHaveBeenCalledWith('shared-base', { jobId: 'job-1' })
    })
    expect(document.body.textContent).toContain('Shared base')
    expect(syncTmBase).not.toHaveBeenCalledWith('hidden-base', expect.anything())
  })

  it('keeps listed shared attachments visible when one base sync fails', async () => {
    vi.mocked(listJobTmAttachmentsApi).mockResolvedValue([
      {
        id: 'att-readable',
        jobId: 'job-1',
        tmBaseId: 'shared-base',
        label: 'Shared base',
        canRead: true,
        canWrite: false,
        canExport: false,
        canClone: false,
        createdBy: 'owner-1',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ])
    vi.mocked(syncTmBase).mockRejectedValueOnce(new Error('Shared base sync failed'))

    const host = mountPanel()

    await vi.waitFor(() => {
      expect(host.textContent).toContain('Shared base')
      expect(host.textContent).toContain('Shared base sync failed')
    })
    expect(host.textContent).not.toContain('No shared bases attached yet.')
  })

  it('lets a member attach and mutate a local extra without server writes', async () => {
    const host = mountPanel()
    await settle()

    host.querySelector<HTMLButtonElement>('[data-testid="job-tm-local-add"]')!.click()
    await nextTick()
    const personalCard = [...host.querySelectorAll<HTMLElement>('[role="button"]')].find(card =>
      card.textContent?.includes('Personal TM')
    )
    personalCard!.click()
    await nextTick()

    expect(host.querySelector('[data-testid="job-tm-local-read"]')).not.toBeNull()
    expect(host.querySelector('[data-testid="job-tm-local-write"]')).not.toBeNull()
    expect(createJobTmAttachment).not.toHaveBeenCalled()
  })

  it('ignores a stale shared load after the job changes', async () => {
    const oldLoad = deferred<Awaited<ReturnType<typeof listJobTmAttachmentsApi>>>()
    const attachment = {
      id: 'att-old',
      jobId: 'job-1',
      tmBaseId: 'old-base',
      canRead: true,
      canWrite: true,
      canExport: false,
      canClone: false,
      createdBy: 'u1',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }
    vi.mocked(listJobTmAttachmentsApi)
      .mockImplementationOnce(() => oldLoad.promise)
      .mockResolvedValueOnce([
        { ...attachment, id: 'att-new', jobId: 'job-2', tmBaseId: 'new-base' },
      ])
    const props = reactive({ jobId: 'job-1', isOwner: true, myRole: 'owner' as const })
    const host = mountPanel(props)

    props.jobId = 'job-2'
    await settle()
    expect(host.textContent).toContain('new-base')

    oldLoad.resolve([attachment])
    await settle()
    expect(host.textContent).toContain('new-base')
    expect(host.textContent).not.toContain('old-base')
  })

  it('clears previous shared rows while the new job load is pending', async () => {
    const newLoad = deferred<Awaited<ReturnType<typeof listJobTmAttachmentsApi>>>()
    const attachment = {
      id: 'att-old',
      jobId: 'job-1',
      tmBaseId: 'old-base',
      canRead: true,
      canWrite: true,
      canExport: false,
      canClone: false,
      createdBy: 'u1',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }
    vi.mocked(listJobTmAttachmentsApi)
      .mockResolvedValueOnce([attachment])
      .mockImplementationOnce(() => newLoad.promise)
    const props = reactive({ jobId: 'job-1', isOwner: true, myRole: 'owner' as const })
    const host = mountPanel(props)
    await settle()

    expect(host.textContent).toContain('old-base')
    props.jobId = 'job-2'
    await nextTick()

    expect(listJobTmAttachmentsApi).toHaveBeenLastCalledWith('job-2')
    expect(host.textContent).not.toContain('old-base')
    expect(host.querySelector('[data-testid="job-tm-shared-read"]')).toBeNull()
    expect(host.querySelector('[data-testid="job-tm-shared-detach"]')).toBeNull()
    expect(patchJobTmAttachment).not.toHaveBeenCalled()
    expect(deleteJobTmAttachment).not.toHaveBeenCalled()
  })

  it('ignores a stale mutation response after the job changes', async () => {
    const oldPatch = deferred<Awaited<ReturnType<typeof patchJobTmAttachment>>>()
    const attachment = {
      id: 'att-old',
      jobId: 'job-1',
      tmBaseId: 'old-base',
      canRead: true,
      canWrite: true,
      canExport: false,
      canClone: false,
      createdBy: 'u1',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }
    vi.mocked(listJobTmAttachmentsApi)
      .mockResolvedValueOnce([attachment])
      .mockResolvedValueOnce([{ ...attachment, jobId: 'job-2', tmBaseId: 'new-base' }])
    vi.mocked(patchJobTmAttachment).mockImplementationOnce(() => oldPatch.promise)
    const props = reactive({ jobId: 'job-1', isOwner: true, myRole: 'owner' as const })
    const host = mountPanel(props)
    await settle()

    host.querySelector<HTMLInputElement>('[data-testid="job-tm-shared-read"]')!.click()
    props.jobId = 'job-2'
    await settle()
    oldPatch.resolve({ ...attachment, canRead: false })
    await settle()

    expect(host.textContent).toContain('new-base')
    expect(host.textContent).not.toContain('old-base')
  })

  it('keeps a mutation error visible after refreshing shared attachments', async () => {
    const attachment = {
      id: 'att-server',
      jobId: 'job-1',
      tmBaseId: 'personal-tm',
      canRead: true,
      canWrite: true,
      canExport: false,
      canClone: false,
      createdBy: 'u1',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }
    vi.mocked(listJobTmAttachmentsApi).mockResolvedValue([attachment])
    vi.mocked(patchJobTmAttachment).mockRejectedValueOnce(new Error('Permission update failed'))
    const host = mountPanel({ jobId: 'job-1', isOwner: true, myRole: 'owner' })
    await settle()

    host.querySelector<HTMLInputElement>('[data-testid="job-tm-shared-read"]')!.click()
    await settle()
    await settle()

    expect(host.textContent).toContain('Permission update failed')
  })
})
