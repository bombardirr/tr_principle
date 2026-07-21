import type { TmUnit } from '@/types/tm'
import { PERSONAL_TM_ATTACHMENT_ID } from '@/tm/projectAttachments'
import { tmLookupKey } from './normalize'

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function exportTmx(
  units: TmUnit[],
  options?: { sourceLang?: string; targetLang?: string },
): string {
  const defaultSource = options?.sourceLang ?? 'en'
  const defaultTarget = options?.targetLang ?? 'ru'
  const body = units
    .map((unit) => {
      const sourceLang = unit.sourceLang ?? defaultSource
      const targetLang = unit.targetLang ?? defaultTarget
      return [
        '    <tu>',
        `      <tuv xml:lang="${escapeXml(sourceLang)}"><seg>${escapeXml(unit.source)}</seg></tuv>`,
        `      <tuv xml:lang="${escapeXml(targetLang)}"><seg>${escapeXml(unit.target)}</seg></tuv>`,
        '    </tu>',
      ].join('\n')
    })
    .join('\n')

  return [
    '<?xml version="1.0"?>',
    '<tmx version="1.4">',
    `  <header srclang="${escapeXml(defaultSource)}" creationtool="appzac" creationtoolversion="1"/>`,
    '  <body>',
    body,
    '  </body>',
    '</tmx>',
  ].join('\n')
}

function readSeg(tuv: Element): string {
  const seg = tuv.querySelector('seg')
  return seg?.textContent ?? ''
}

function langOf(tuv: Element): string | undefined {
  return tuv.getAttribute('xml:lang') ?? tuv.getAttribute('lang') ?? undefined
}

export function parseTmx(xml: string): TmUnit[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) {
    throw new Error('INVALID_TMX')
  }

  const headerLang = doc.querySelector('header')?.getAttribute('srclang') ?? undefined
  const now = new Date().toISOString()
  const units: TmUnit[] = []

  for (const tu of doc.querySelectorAll('body > tu')) {
    const tuvs = [...tu.querySelectorAll(':scope > tuv')]
    if (tuvs.length < 2) continue
    const sourceTuv = tuvs[0]!
    const targetTuv = tuvs[1]!
    const source = readSeg(sourceTuv)
    const target = readSeg(targetTuv)
    if (!source.trim()) continue

    const sourceLang = langOf(sourceTuv) ?? headerLang
    const targetLang = langOf(targetTuv)
    units.push({
      id: crypto.randomUUID(),
      baseId: PERSONAL_TM_ATTACHMENT_ID,
      source,
      target,
      sourceKey: tmLookupKey(source, sourceLang, targetLang),
      sourceLang,
      targetLang,
      createdAt: now,
      updatedAt: now,
    })
  }

  return units
}
