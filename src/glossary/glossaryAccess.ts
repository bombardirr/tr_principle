import { sharedGlossaryLocalId } from '@/storage/glossaryBasesIdb'
import type { ProjectMeta } from '@/types/project'

export type JobGlossaryAccessRow = {
  glossaryBaseId: string
  ownerId?: string
  createdBy?: string
  canRead: boolean
  canWrite: boolean
  canExport: boolean
  canClone: boolean
}

export type GlossaryBaseAccessInput = {
  projectMeta: ProjectMeta
  jobQueryId?: string | null
  jobShared?: JobGlossaryAccessRow[]
}

export type GlossaryBaseAccess = {
  jobContext: boolean
  readableBaseIds: string[]
  writableBaseIds: string[]
  exportableBaseIds: string[]
  cloneableBaseIds: string[]
}

function isJobEditorContext(
  jobQueryId: string | null | undefined,
  projectJobId: string | null | undefined,
): boolean {
  return Boolean(jobQueryId && projectJobId && jobQueryId === projectJobId)
}

type AccessFlags = Pick<JobGlossaryAccessRow, 'canRead' | 'canWrite' | 'canExport' | 'canClone'>

function addFlags(map: Map<string, AccessFlags>, id: string, flags: AccessFlags) {
  const previous = map.get(id)
  map.set(id, {
    canRead: previous?.canRead || flags.canRead,
    canWrite: previous?.canWrite || flags.canWrite,
    canExport: previous?.canExport || flags.canExport,
    canClone: previous?.canClone || flags.canClone,
  })
}

/** Resolve job-shared glossary bases. Personal appears only when explicitly attached. */
export function resolveGlossaryAccess(input: GlossaryBaseAccessInput): GlossaryBaseAccess {
  const jobContext = isJobEditorContext(input.jobQueryId, input.projectMeta.jobId)
  const attached = new Map<string, AccessFlags>()

  if (jobContext) {
    for (const row of input.jobShared ?? []) {
      if (!row.glossaryBaseId) continue
      const ownerId = row.ownerId || row.createdBy
      const id = ownerId
        ? sharedGlossaryLocalId(ownerId, row.glossaryBaseId)
        : row.glossaryBaseId
      addFlags(attached, id, row)
    }
  }

  const readableBaseIds: string[] = []
  const writableBaseIds: string[] = []
  const exportableBaseIds: string[] = []
  const cloneableBaseIds: string[] = []
  for (const [id, flags] of attached) {
    if (flags.canRead) readableBaseIds.push(id)
    if (flags.canWrite) writableBaseIds.push(id)
    if (flags.canExport) exportableBaseIds.push(id)
    if (flags.canClone) cloneableBaseIds.push(id)
  }
  return { jobContext, readableBaseIds, writableBaseIds, exportableBaseIds, cloneableBaseIds }
}
