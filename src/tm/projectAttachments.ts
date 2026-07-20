import type { ProjectMeta, ProjectTmAttachment, ProjectTmAttachmentId } from '@/types/project'

export const PERSONAL_TM_ATTACHMENT_ID: ProjectTmAttachmentId = 'personal-tm'

export type TmAttachmentCatalogItem = {
  id: ProjectTmAttachmentId
  label: string
  color: string
  glyph: 'tm'
}

export const TM_ATTACHMENT_CATALOG: TmAttachmentCatalogItem[] = [
  {
    id: PERSONAL_TM_ATTACHMENT_ID,
    label: 'Personal TM',
    color: '#5ea8ff',
    glyph: 'tm',
  },
]

type LegacyAttachment = ProjectTmAttachment & { connected?: boolean }

export function normalizeProjectTmAttachments(meta: ProjectMeta): ProjectTmAttachment[] {
  const raw = (meta.tmAttachments ?? []) as LegacyAttachment[]
  const out: ProjectTmAttachment[] = []
  for (const item of raw) {
    if (!TM_ATTACHMENT_CATALOG.some(c => c.id === item.id)) continue
    if (item.connected === false) continue
    // connected === true | undefined with presence → attached
    out.push({
      id: item.id,
      canRead: item.canRead ?? true,
      canWrite: item.canWrite ?? true,
    })
  }
  // de-dupe by id (last wins)
  const map = new Map(out.map(x => [x.id, x]))
  return [...map.values()]
}

export function attachProjectTm(
  meta: ProjectMeta,
  id: ProjectTmAttachmentId,
  perms: { canRead?: boolean; canWrite?: boolean } = {},
): ProjectTmAttachment[] {
  const current = normalizeProjectTmAttachments(meta)
  if (current.some(x => x.id === id)) return current
  return [
    ...current,
    {
      id,
      canRead: perms.canRead ?? true,
      canWrite: perms.canWrite ?? true,
    },
  ]
}

export function detachProjectTm(meta: ProjectMeta, id: ProjectTmAttachmentId): ProjectTmAttachment[] {
  return normalizeProjectTmAttachments(meta).filter(x => x.id !== id)
}

export function updateProjectTmAttachment(
  meta: ProjectMeta,
  id: ProjectTmAttachmentId,
  patch: Partial<Pick<ProjectTmAttachment, 'canRead' | 'canWrite'>>,
): ProjectTmAttachment[] {
  return normalizeProjectTmAttachments(meta).map(item =>
    item.id === id ? { ...item, ...patch } : item,
  )
}

export function canReadPersonalTm(meta: ProjectMeta): boolean {
  const item = normalizeProjectTmAttachments(meta).find(x => x.id === PERSONAL_TM_ATTACHMENT_ID)
  return Boolean(item?.canRead)
}

export function canWritePersonalTm(meta: ProjectMeta): boolean {
  const item = normalizeProjectTmAttachments(meta).find(x => x.id === PERSONAL_TM_ATTACHMENT_ID)
  return Boolean(item?.canWrite)
}
