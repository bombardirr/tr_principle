import { downloadBlob } from '@/docx/exportDocx'
import { importTmUnits, listTmUnits } from '@/storage/tmIdb'
import { sharedTmLocalId } from '@/storage/tmBasesIdb'
import { markTmDirty, syncTmBase } from '@/tm/sync'
import { exportTmx } from '@/tm/tmx'
import type { TmUnit } from '@/types/tm'

export async function ensureSharedUnitsForJob(opts: {
  jobId: string
  ownerId: string
  tmBaseId: string
}): Promise<TmUnit[]> {
  const localId = sharedTmLocalId(opts.ownerId, opts.tmBaseId)
  let units = await listTmUnits({ baseIds: [localId] })
  if (units.length) return units
  await syncTmBase(opts.tmBaseId, { jobId: opts.jobId })
  return listTmUnits({ baseIds: [localId] })
}

export async function exportSharedJobTm(opts: {
  jobId: string
  ownerId: string
  tmBaseId: string
  label?: string
  sourceLang?: string
  targetLang?: string
}): Promise<{ count: number }> {
  const units = await ensureSharedUnitsForJob(opts)
  if (!units.length) return { count: 0 }
  const xml = exportTmx(units, {
    sourceLang: opts.sourceLang,
    targetLang: opts.targetLang,
  })
  const safe = (opts.label ?? opts.tmBaseId).replace(/[^\w.-]+/g, '_').slice(0, 64)
  downloadBlob(new Blob([xml], { type: 'application/xml' }), `${safe || 'tm'}.tmx`)
  return { count: units.length }
}

export async function cloneSharedJobTm(opts: {
  jobId: string
  ownerId: string
  tmBaseId: string
  targetBaseId: string
}): Promise<{ count: number }> {
  const units = await ensureSharedUnitsForJob(opts)
  if (!units.length) return { count: 0 }
  const copies = units.map(u => ({
    ...u,
    id: crypto.randomUUID(),
    baseId: opts.targetBaseId,
    deletedAt: null as string | null,
    updatedAt: new Date().toISOString(),
  }))
  const { ids } = await importTmUnits(copies, { baseId: opts.targetBaseId })
  markTmDirty(...ids)
  return { count: ids.length }
}
