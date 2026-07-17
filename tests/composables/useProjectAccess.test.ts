import { createApp, h, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/auth/api'

const claimProjectLock = vi.fn()

vi.mock('@/projects/api', () => ({
  claimProjectLock,
  releaseProjectLock: vi.fn(),
}))

vi.mock('@/composables/useProjectLease', () => ({
  useProjectLease: () => ({
    isLeader: ref(true),
    blocked: ref(false),
    start: vi.fn(),
    stop: vi.fn(),
  }),
}))

vi.mock('@/storage/projectLease', () => ({
  getTabId: () => 'tab-1',
}))

const mounted: { unmount: () => void }[] = []

afterEach(() => {
  claimProjectLock.mockReset()
  while (mounted.length) mounted.pop()!.unmount()
})

describe('useProjectAccess', () => {
  it.each([401, 403])('blocks editing when cloud lock claim returns %i', async status => {
    claimProjectLock.mockRejectedValueOnce(new ApiError(status, 'not allowed'))
    const { useProjectAccess } = await import('@/composables/useProjectAccess')
    let access!: ReturnType<typeof useProjectAccess>
    const host = document.createElement('div')
    document.body.append(host)
    const app = createApp({
      setup() {
        access = useProjectAccess('project-1')
        return () => h('span')
      },
    })
    app.mount(host)
    mounted.push({
      unmount: () => {
        app.unmount()
        host.remove()
      },
    })

    await access.start()
    await nextTick()

    expect(access.cloudOk.value).toBe(false)
    expect(access.blocked.value).toBe(true)
  })
})
