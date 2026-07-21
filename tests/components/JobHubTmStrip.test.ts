import { createApp, h, nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ownerUser = {
  id: 'owner-1',
  email: 'o@example.com',
  display_name: 'Owner',
  is_admin: false,
  plan: 'pro' as const,
  plan_status: 'active' as const,
}

const listJobTmAttachmentsApi = vi.fn(async () => [] as { id: string; tmBaseId: string; canRead: boolean; canWrite: boolean }[])
const createJobTmAttachment = vi.fn()
const getJob = vi.fn()
const listMembers = vi.fn()
const listProjects = vi.fn(async () => [])

vi.mock('../../src/jobs/tmAttachmentsApi', () => ({
  listJobTmAttachmentsApi: (...args: unknown[]) => listJobTmAttachmentsApi(...args),
  createJobTmAttachment: (...args: unknown[]) => createJobTmAttachment(...args),
  patchJobTmAttachment: vi.fn(),
  deleteJobTmAttachment: vi.fn(),
}))

vi.mock('../../src/jobs/api', () => ({
  getJob: (...args: unknown[]) => getJob(...args),
  listMembers: (...args: unknown[]) => listMembers(...args),
  deleteJob: vi.fn(),
  archiveJob: vi.fn(),
  leaveJob: vi.fn(),
  patchJob: vi.fn(),
}))

vi.mock('../../src/storage/idb', () => ({
  listProjects: (...args: unknown[]) => listProjects(...args),
  getProject: vi.fn(),
  saveProject: vi.fn(),
  createProjectId: vi.fn(() => 'p1'),
}))

vi.mock('../../src/auth/session', () => ({
  useAuth: () => ({ user: { value: ownerUser } }),
  publicActorLabel: () => 'Owner',
}))

vi.mock('../../src/jobs/reportProgress', () => ({
  computeLocalJobProgress: vi.fn(),
  reportJobMemberProgress: vi.fn(),
}))

vi.mock('../../src/jobs/joinActivity', () => ({
  acknowledgeJobJoins: vi.fn(),
}))

vi.mock('../../src/storage/tmIdb', () => ({
  getPersonalTmStats: vi.fn(async () => ({ count: 0, lastUpdatedAt: null })),
}))

import JobHubInline from '../../src/components/JobHubInline.vue'

const messages = {
  en: {
    jobs: {
      loading: 'Loading',
      noLinkedProject: 'No project is linked yet. Create or import your personal copy.',
      createFromDocx: 'From DOCX',
      createEmpty: 'Empty',
      importProject: 'Import',
      chooseLocalProject: 'Choose…',
      bindProject: 'Bind',
      back: 'Back',
      openPanel: 'Panel',
      roleOwner: 'Owner',
      roleTranslator: 'Translator',
      roleViewer: 'Viewer',
      progressTmDetail: '{hits}/{total}',
      progressConfirmed: '{done}/{total}',
      progressPct: '{pct}%',
      partDoneColumn: 'Done',
      partDoneYes: '✓',
    },
    projects: {
      tmPersonalBase: 'Personal TM',
      tmOpenPicker: 'Attach TM',
      tmPermRead: 'Read',
      tmPermWrite: 'Write',
      tmPermReadShort: 'R',
      tmPermWriteShort: 'W',
      tmPermOn: 'on',
      tmPermOff: 'off',
      tmChipTipHint: 'Manage in bases dialog',
      tmUnitsStat: '{n} units',
      tmLastUpdatedNever: 'never',
      tmLastUpdated: '{date}',
      tmBasesTitle: 'Bases',
      tmBasesEmpty: 'Empty',
      tmBasesAdd: 'Add',
      tmDetach: 'Detach',
    },
    tmCollection: {
      pickTitle: 'Pick',
      title: 'Collection',
      pickHint: 'hint',
      hint: 'hint',
      close: 'Close',
      attached: 'Attached',
      openFull: 'Full',
      openFromProjects: 'Close',
    },
  },
}

const mounted: { unmount: () => void }[] = []

function mountHub() {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(JobHubInline, { jobId: 'job-1' }) })
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

beforeEach(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)

  listJobTmAttachmentsApi.mockReset()
  listJobTmAttachmentsApi.mockResolvedValue([])
  getJob.mockResolvedValue({
    id: 'job-1',
    title: 'Job',
    ownerUserId: ownerUser.id,
    sourceLang: 'ru',
    targetLang: 'en',
  })
  listMembers.mockResolvedValue([
    {
      userId: ownerUser.id,
      role: 'owner',
      progressDone: 0,
      progressTotal: 0,
      progressTm: 0,
    },
  ])
  listProjects.mockResolvedValue([])
})

afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount()
  vi.unstubAllGlobals()
})

describe('JobHub unbound TM strip', () => {
  it('shows empty strip with add for owner when no project linked', async () => {
    const host = mountHub()
    await nextTick()
    await nextTick()
    await Promise.resolve()
    await nextTick()

    expect(host.querySelector('[data-testid="job-hub-unbound"]')).not.toBeNull()
    expect(
      host.querySelector('[data-testid="job-hub-unbound"] [data-testid="tm-strip-add"]'),
    ).not.toBeNull()
    expect(listJobTmAttachmentsApi).toHaveBeenCalledWith('job-1')
  })

  it('hides add button for non-owner', async () => {
    getJob.mockResolvedValue({
      id: 'job-1',
      title: 'Job',
      ownerUserId: 'someone-else',
      sourceLang: 'ru',
      targetLang: 'en',
    })
    listMembers.mockResolvedValue([
      {
        userId: ownerUser.id,
        role: 'translator',
        progressDone: 0,
        progressTotal: 0,
        progressTm: 0,
      },
    ])

    const host = mountHub()
    await nextTick()
    await nextTick()
    await Promise.resolve()
    await nextTick()

    expect(host.querySelector('[data-testid="job-hub-unbound"]')).not.toBeNull()
    expect(
      host.querySelector('[data-testid="job-hub-unbound"] [data-testid="tm-strip-add"]'),
    ).toBeNull()
  })
})
