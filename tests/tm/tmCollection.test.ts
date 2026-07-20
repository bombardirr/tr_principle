import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/storage/tmIdb', () => ({
  listTmUnits: vi.fn(),
  clearTmUnits: vi.fn(),
}))
vi.mock('../../src/storage/idb', () => ({
  listProjects: vi.fn(),
  getProject: vi.fn(),
  saveProject: vi.fn(),
}))
vi.mock('../../src/tm/jobAttachments', () => ({
  detachJobTmEverywhere: vi.fn(() => 1),
}))

import { listTmUnits, clearTmUnits } from '../../src/storage/tmIdb'
import { listProjects, getProject, saveProject } from '../../src/storage/idb'
import { detachJobTmEverywhere } from '../../src/tm/jobAttachments'
import { PERSONAL_TM_ATTACHMENT_ID } from '../../src/tm/projectAttachments'
import { deleteOwnPersonalTm, ensureDefaultTmInCatalog } from '../../src/tm/tmCollection'

describe('tmCollection', () => {
  beforeEach(() => {
    vi.mocked(listTmUnits).mockResolvedValue([{ id: 'u1' } as never, { id: 'u2' } as never])
    vi.mocked(clearTmUnits).mockResolvedValue(undefined)
    vi.mocked(listProjects).mockResolvedValue([
      { id: 'p1', tmAttachments: [{ id: PERSONAL_TM_ATTACHMENT_ID, canRead: true, canWrite: true }] } as never,
      { id: 'p2', tmAttachments: [] } as never,
    ])
    vi.mocked(getProject).mockImplementation(async id => {
      if (id === 'p1') {
        return {
          meta: {
            id: 'p1',
            name: 'A',
            createdAt: '',
            updatedAt: '',
            segmentCount: 0,
            doneCount: 0,
            tmAttachments: [{ id: PERSONAL_TM_ATTACHMENT_ID, canRead: true, canWrite: true }],
          },
          segments: [],
          docx: new ArrayBuffer(0),
        }
      }
      return undefined
    })
    vi.mocked(saveProject).mockResolvedValue(undefined)
    vi.mocked(detachJobTmEverywhere).mockReturnValue(1)
  })

  it('ensureDefault includes personal-tm', () => {
    expect(ensureDefaultTmInCatalog().some(x => x.id === PERSONAL_TM_ATTACHMENT_ID)).toBe(true)
  })

  it('deleteOwnPersonalTm clears units and detaches projects/jobs', async () => {
    const result = await deleteOwnPersonalTm()
    expect(clearTmUnits).toHaveBeenCalled()
    expect(saveProject).toHaveBeenCalled()
    expect(detachJobTmEverywhere).toHaveBeenCalledWith(PERSONAL_TM_ATTACHMENT_ID)
    expect(result).toEqual({ unitCountCleared: 2, projectsDetached: 1, jobsDetached: 1 })
  })
})
