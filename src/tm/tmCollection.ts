import { getProject, listProjects, saveProject } from '@/storage/idb'
import { clearTmUnits, listTmUnits } from '@/storage/tmIdb'
import { detachJobTmEverywhere } from '@/tm/jobAttachments'
import {
  PERSONAL_TM_ATTACHMENT_ID,
  detachProjectTm,
  type TmAttachmentCatalogItem,
} from '@/tm/projectAttachments'
import { deleteTmBase, listTmCatalog } from '@/tm/tmBasesCatalog'
import { notifyTmCollectionChanged } from '@/tm/tmCollectionEvents'

/** @deprecated Prefer listTmCatalog() */
export function ensureDefaultTmInCatalog(): TmAttachmentCatalogItem[] {
  return [
    {
      id: PERSONAL_TM_ATTACHMENT_ID,
      label: 'Personal TM',
      color: '#5b9fd4',
      glyph: 'tm',
    },
  ]
}

export { listTmCatalog }

async function detachBaseEverywhere(baseId: string): Promise<{
  projectsDetached: number
  jobsDetached: number
}> {
  let projectsDetached = 0
  const metas = await listProjects()
  for (const m of metas) {
    const attached = (m.tmAttachments ?? []).some(x => x.id === baseId)
    if (!attached) continue
    const record = await getProject(m.id)
    if (!record) continue
    record.meta.tmAttachments = detachProjectTm(record.meta, baseId)
    record.meta.updatedAt = new Date().toISOString()
    await saveProject(record)
    projectsDetached += 1
  }
  const jobsDetached = detachJobTmEverywhere(baseId)
  return { projectsDetached, jobsDetached }
}

export async function deleteOwnPersonalTm(): Promise<{
  unitCountCleared: number
  projectsDetached: number
  jobsDetached: number
}> {
  const units = await listTmUnits({ baseIds: [PERSONAL_TM_ATTACHMENT_ID] })
  await clearTmUnits(PERSONAL_TM_ATTACHMENT_ID)
  const { projectsDetached, jobsDetached } = await detachBaseEverywhere(PERSONAL_TM_ATTACHMENT_ID)
  notifyTmCollectionChanged()
  return { unitCountCleared: units.length, projectsDetached, jobsDetached }
}

/** Remove a named base: units + catalog + detach. Personal must use deleteOwnPersonalTm. */
export async function deleteNamedTmBase(baseId: string): Promise<{
  unitCountCleared: number
  projectsDetached: number
  jobsDetached: number
}> {
  if (baseId === PERSONAL_TM_ATTACHMENT_ID) {
    throw new Error('use deleteOwnPersonalTm for personal')
  }
  const units = await listTmUnits({ baseIds: [baseId] })
  await clearTmUnits(baseId)
  await deleteTmBase(baseId)
  const { projectsDetached, jobsDetached } = await detachBaseEverywhere(baseId)
  notifyTmCollectionChanged()
  return { unitCountCleared: units.length, projectsDetached, jobsDetached }
}
