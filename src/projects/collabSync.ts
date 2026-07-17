import {
  createCloudProject,
  getCloudProject,
  pullProjectSync,
  pushProjectSync,
} from '@/projects/collabApi'
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

/** Build a local editable snapshot after accepting a shared-project invite. */
export async function fetchSharedProject(projectId: string): Promise<ProjectRecord> {
  const [project, snapshot] = await Promise.all([getCloudProject(projectId), pullProjectSync(projectId)])
  return {
    meta: {
      ...snapshot.meta,
      id: project.id,
      name: project.name,
      sourceLang: project.sourceLang,
      targetLang: project.targetLang,
      cloudShared: true,
    },
    segments: snapshot.segments,
    // Original DOCX bytes remain local to the owner; translation editing works from the snapshot.
    docx: new ArrayBuffer(0),
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
