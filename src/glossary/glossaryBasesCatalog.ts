import {
  createGlossaryBase,
  deleteGlossaryBase,
  ensurePersonalGlossaryBase,
  listGlossaryBases,
  type GlossaryBaseRecord,
} from '@/storage/glossaryBasesIdb'

export type GlossaryAttachmentCatalogItem = {
  id: string
  label: string
  color: string
  glyph: 'glossary'
}

export type { GlossaryBaseRecord }

export function toGlossaryCatalogItem(row: GlossaryBaseRecord): GlossaryAttachmentCatalogItem {
  return {
    id: row.id,
    label: row.label,
    color: row.color,
    glyph: 'glossary',
  }
}

/** Live catalog for glossary pickers, always including personal-glossary. */
export async function listGlossaryCatalog(): Promise<GlossaryAttachmentCatalogItem[]> {
  return (await listGlossaryBases()).map(toGlossaryCatalogItem)
}

export { createGlossaryBase, deleteGlossaryBase, ensurePersonalGlossaryBase, listGlossaryBases }
