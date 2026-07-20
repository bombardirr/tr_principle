import { getProject, listProjects, saveProject } from '@/storage/idb'
import { clearTmUnits, listTmUnits } from '@/storage/tmIdb'
import { detachJobTmEverywhere } from '@/tm/jobAttachments'
import {
  PERSONAL_TM_ATTACHMENT_ID,
  TM_ATTACHMENT_CATALOG,
  detachProjectTm,
  type TmAttachmentCatalogItem,
} from '@/tm/projectAttachments'
import { notifyTmCollectionChanged } from '@/tm/tmCollectionEvents'

export function ensureDefaultTmInCatalog(): TmAttachmentCatalogItem[] {
  return [...TM_ATTACHMENT_CATALOG]
}

export async function deleteOwnPersonalTm(): Promise<{
  unitCountCleared: number
  projectsDetached: number
  jobsDetached: number
}> {
  const units = await listTmUnits()
  await clearTmUnits()

  let projectsDetached = 0
  const metas = await listProjects()
  for (const m of metas) {
    const attached = (m.tmAttachments ?? []).some(x => x.id === PERSONAL_TM_ATTACHMENT_ID)
    if (!attached) continue
    const record = await getProject(m.id)
    if (!record) continue
    record.meta.tmAttachments = detachProjectTm(record.meta, PERSONAL_TM_ATTACHMENT_ID)
    record.meta.updatedAt = new Date().toISOString()
    await saveProject(record)
    projectsDetached += 1
  }

  const jobsDetached = detachJobTmEverywhere(PERSONAL_TM_ATTACHMENT_ID)
  notifyTmCollectionChanged()
  return { unitCountCleared: units.length, projectsDetached, jobsDetached }
}
