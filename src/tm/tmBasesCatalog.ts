import {
  createTmBase,
  deleteTmBase,
  ensurePersonalTmBase,
  ensureTmBasesForIds,
  getTmBase,
  listTmBases,
  renameTmBase,
  type TmBaseRecord,
} from '@/storage/tmBasesIdb'
import {
  PERSONAL_TM_ATTACHMENT_ID,
  type TmAttachmentCatalogItem,
} from '@/tm/projectAttachments'

export type { TmBaseRecord }

export function toCatalogItem(row: TmBaseRecord): TmAttachmentCatalogItem {
  return {
    id: row.id,
    label: row.label,
    color: row.color,
    glyph: 'tm',
  }
}

/** Live catalog for pickers/collection (always includes personal-tm). */
export async function listTmCatalog(): Promise<TmAttachmentCatalogItem[]> {
  const bases = await listTmBases()
  return bases.map(toCatalogItem)
}

export {
  createTmBase,
  deleteTmBase,
  ensurePersonalTmBase,
  ensureTmBasesForIds,
  getTmBase,
  listTmBases,
  renameTmBase,
  PERSONAL_TM_ATTACHMENT_ID,
}
