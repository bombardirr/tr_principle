import type { ProjectMeta, ProjectTmAttachment, ProjectTmAttachmentId } from '@/types/project'

export const PERSONAL_TM_ATTACHMENT_ID: ProjectTmAttachmentId = 'personal-tm'

/** Stable unique palette for TM bases (icon + accents). */
export const TM_BASE_COLORS = [
  '#5b9fd4',
  '#3dd68c',
  '#e8a838',
  '#c77dff',
  '#ff7a59',
  '#4db8ff',
  '#2dd4bf',
  '#f472b6',
] as const

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
    color: TM_BASE_COLORS[0],
    glyph: 'tm',
  },
]

export function colorForTmBase(id: ProjectTmAttachmentId, fallbackIndex = 0): string {
  const hit = TM_ATTACHMENT_CATALOG.find(item => item.id === id)
  if (hit) return hit.color
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return TM_BASE_COLORS[(hash || fallbackIndex) % TM_BASE_COLORS.length]!
}

type LegacyAttachment = ProjectTmAttachment & { connected?: boolean }

export function normalizeProjectTmAttachments(meta: ProjectMeta): ProjectTmAttachment[] {
  const raw = (meta.tmAttachments ?? []) as LegacyAttachment[]
  const out: ProjectTmAttachment[] = []
  for (const item of raw) {
    if (!item?.id || typeof item.id !== 'string') continue
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
