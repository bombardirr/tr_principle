import { downloadBlob } from '@/docx/exportDocx'
import { syncGlossaryBase, markGlossaryDirty } from '@/glossary/sync'
import { exportTbx } from '@/glossary/tbx'
import { listGlossaryTerms, putGlossaryTerm } from '@/storage/glossaryIdb'
import { sharedGlossaryLocalId } from '@/storage/glossaryBasesIdb'
import type { GlossaryTerm } from '@/types/glossary'

export async function ensureSharedGlossaryTermsForJob(opts: {
  projectId: string
  ownerId: string
  glossaryBaseId: string
}): Promise<GlossaryTerm[]> {
  const localId = sharedGlossaryLocalId(opts.ownerId, opts.glossaryBaseId)
  let terms = await listGlossaryTerms({ baseIds: [localId] })
  if (terms.length) return terms
  await syncGlossaryBase(localId, { projectId: opts.projectId })
  terms = await listGlossaryTerms({ baseIds: [localId] })
  return terms
}

export async function exportSharedJobGlossary(opts: {
  projectId: string
  ownerId: string
  glossaryBaseId: string
  label?: string
}): Promise<{ count: number }> {
  const terms = await ensureSharedGlossaryTermsForJob(opts)
  if (!terms.length) return { count: 0 }
  const safe = (opts.label ?? opts.glossaryBaseId).replace(/[^\w.-]+/g, '_').slice(0, 64)
  downloadBlob(
    new Blob([exportTbx(terms)], { type: 'application/xml' }),
    `${safe || 'glossary'}.tbx`,
  )
  return { count: terms.length }
}

export async function cloneSharedJobGlossary(opts: {
  projectId: string
  ownerId: string
  glossaryBaseId: string
  targetBaseId: string
}): Promise<{ count: number }> {
  const terms = await ensureSharedGlossaryTermsForJob(opts)
  const now = new Date().toISOString()
  const ids: string[] = []
  for (const term of terms) {
    const id = crypto.randomUUID()
    await putGlossaryTerm({
      ...term,
      id,
      baseId: opts.targetBaseId,
      deletedAt: null,
      updatedAt: now,
    })
    ids.push(id)
  }
  markGlossaryDirty(...ids)
  return { count: ids.length }
}
