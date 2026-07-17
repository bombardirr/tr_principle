import { createCloudProject, pullProjectSync, pushProjectSync } from '@/projects/collabApi'
import { saveProject } from '@/storage/idb'
import type { ProjectRecord } from '@/types/project'

/** Create the cloud record with the existing local UUID, then seed its snapshot. */
export async function promoteProject(
  record: ProjectRecord,
  lock: { holderId: string; token: string }
): Promise<void> {
  await createCloudProject(record.meta)
  record.meta.cloudShared = true
  await pushProjectSnapshot(record, lock)
  await saveProject(record)
}

export async function pullProjectSnapshot(record: ProjectRecord): Promise<ProjectRecord> {
  const remote = await pullProjectSync(record.meta.id)
  return {
    ...record,
    meta: { ...record.meta, ...remote.meta, cloudShared: true },
    segments: remote.segments,
  }
}

export async function pushProjectSnapshot(
  record: ProjectRecord,
  lock: { holderId: string; token: string }
): Promise<void> {
  await pushProjectSync(record.meta.id, {
    meta: record.meta,
    segments: record.segments,
    holderId: lock.holderId,
    token: lock.token,
  })
}
