import { normalizeProjectTmAttachments } from '@/tm/projectAttachments'
import type { ProjectMeta, ProjectTmAttachment } from '@/types/project'

export type JobTmAccessRow = {
  tmBaseId: string
  canRead: boolean
  canWrite: boolean
}

export type TmBaseAccessInput = {
  projectMeta: ProjectMeta
  jobQueryId?: string | null
  jobShared?: JobTmAccessRow[]
  jobLocal?: ProjectTmAttachment[]
}

export type TmBaseAccess = {
  jobContext: boolean
  readableBaseIds: string[]
  writableBaseIds: string[]
}

/** True when editor was opened with matching `?job=` for this project. */
export function isJobEditorContext(
  jobQueryId: string | null | undefined,
  projectJobId: string | null | undefined,
): boolean {
  return Boolean(jobQueryId && projectJobId && jobQueryId === projectJobId)
}

function addFlags(
  map: Map<string, { canRead: boolean; canWrite: boolean }>,
  id: string,
  canRead: boolean,
  canWrite: boolean,
) {
  const prev = map.get(id) ?? { canRead: false, canWrite: false }
  map.set(id, {
    canRead: prev.canRead || canRead,
    canWrite: prev.canWrite || canWrite,
  })
}

/**
 * Resolve attached TM base ids with Read/Write from project (+ job layers when in job context).
 * Personal is not implicit — only attached bases appear.
 */
export function resolveTmBaseAccess(input: TmBaseAccessInput): TmBaseAccess {
  const jobContext = isJobEditorContext(input.jobQueryId, input.projectMeta.jobId)
  const map = new Map<string, { canRead: boolean; canWrite: boolean }>()

  for (const row of normalizeProjectTmAttachments(input.projectMeta)) {
    addFlags(map, row.id, row.canRead, row.canWrite)
  }

  if (jobContext) {
    for (const row of input.jobShared ?? []) {
      if (!row.tmBaseId) continue
      addFlags(map, row.tmBaseId, row.canRead, row.canWrite)
    }
    for (const row of input.jobLocal ?? []) {
      if (!row.id) continue
      addFlags(map, row.id, row.canRead, row.canWrite)
    }
  }

  const readableBaseIds: string[] = []
  const writableBaseIds: string[] = []
  for (const [id, flags] of map) {
    if (flags.canRead) readableBaseIds.push(id)
    if (flags.canWrite) writableBaseIds.push(id)
  }
  return { jobContext, readableBaseIds, writableBaseIds }
}
