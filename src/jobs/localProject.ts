import { fingerprintDocx } from '@/jobs/fingerprint'
import type { CloudProject } from '@/types/cloudProject'
import type { ProjectMeta, ProjectRecord } from '@/types/project'
import { getProject, saveProject } from '@/storage/idb'

export function projectFingerprint(record: ProjectRecord) {
  const filename =
    record.meta.sourceFilename?.trim() ||
    `${record.meta.name.replace(/\.docx$/i, '') || 'Untitled'}.docx`
  return fingerprintDocx(filename, record.docx)
}

export function bindLocalProjectToCloudProject(
  record: ProjectRecord,
  cloudProject: CloudProject,
): ProjectRecord {
  return {
    ...record,
    meta: {
      ...record.meta,
      projectId: cloudProject.id,
      sourceFilename: cloudProject.sourceFilename || record.meta.sourceFilename,
      sourceHash: cloudProject.sourceHash || record.meta.sourceHash,
    },
  }
}

/** Clear meta.projectId on local projects that pointed at this cloud project. */
export async function unlinkLocalProjectsFromCloudProject(
  projectId: string,
  projects: ProjectMeta[],
): Promise<void> {
  for (const meta of projects) {
    if (meta.projectId !== projectId) continue
    const record = await getProject(meta.id)
    if (!record?.meta.projectId) continue
    record.meta.projectId = undefined
    await saveProject(record)
  }
}

export function inviteLink(token: string, origin = window.location.origin): string {
  return `${origin.replace(/\/$/, '')}/job-invite/${encodeURIComponent(token)}`
}
