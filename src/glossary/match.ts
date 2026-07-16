import type { GlossaryHit, GlossaryTerm, GlossaryTermStatus } from '@/types/glossary'
import { stripMarkers } from '@/docx/tags'

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function isWordChar(ch: string | undefined): boolean {
  if (!ch) return false
  return /[\p{L}\p{N}_]/u.test(ch)
}

/** Find glossary hits in plain (marker-stripped) text. Longer terms win overlapping spans;
 * multiple target variants for the same source span are all kept. */
export function findGlossaryHits(
  text: string,
  terms: GlossaryTerm[],
  sourceLang: string,
  targetLang: string,
): GlossaryHit[] {
  const plain = text
  const candidates = terms
    .filter(
      (t) =>
        !t.deletedAt &&
        t.sourceLang === sourceLang &&
        t.targetLang === targetLang &&
        t.sourceTerm.trim().length > 0,
    )
    .slice()
    .sort((a, b) => b.sourceTerm.length - a.sourceTerm.length)

  const occupied: boolean[] = Array.from({ length: plain.length }, () => false)
  const hits: GlossaryHit[] = []

  for (const term of candidates) {
    const needle = term.sourceTerm
    const flags = term.caseSensitive ? 'g' : 'gi'
    const re = new RegExp(escapeRegExp(needle), flags)
    let m: RegExpExecArray | null
    while ((m = re.exec(plain)) !== null) {
      const start = m.index
      const end = start + m[0].length
      if (end <= start) {
        re.lastIndex = start + 1
        continue
      }
      const before = plain[start - 1]
      const after = plain[end]
      if (isWordChar(before) || isWordChar(after)) continue

      let clash = false
      for (let i = start; i < end; i++) {
        if (occupied[i]) {
          clash = true
          break
        }
      }
      if (clash) {
        // Same span already claimed — keep additional target variants for that source.
        const colocated = hits.find((h) => h.start === start && h.end === end)
        if (
          colocated &&
          (term.caseSensitive
            ? colocated.sourceTerm === m[0]
            : colocated.sourceTerm.toLowerCase() === m[0].toLowerCase())
        ) {
          hits.push({
            start,
            end,
            termId: term.id,
            status: term.status,
            sourceTerm: term.sourceTerm,
            targetTerm: term.targetTerm,
          })
        }
        continue
      }

      for (let i = start; i < end; i++) occupied[i] = true
      hits.push({
        start,
        end,
        termId: term.id,
        status: term.status,
        sourceTerm: term.sourceTerm,
        targetTerm: term.targetTerm,
      })
    }
  }

  return hits.sort((a, b) => a.start - b.start || a.termId.localeCompare(b.termId))
}

export function findGlossaryHitsInTagged(
  taggedSource: string,
  terms: GlossaryTerm[],
  sourceLang: string,
  targetLang: string,
): GlossaryHit[] {
  return findGlossaryHits(stripMarkers(taggedSource), terms, sourceLang, targetLang)
}

/** Escape text and wrap glossary hit ranges with mark tags (plain-text path). */
export function plainTextWithGlossaryMarks(text: string, hits: GlossaryHit[]): string {
  if (!hits.length) return escapeHtml(text)
  let out = ''
  let cursor = 0
  for (const hit of hits) {
    if (hit.start < cursor) continue
    out += escapeHtml(text.slice(cursor, hit.start))
    const cls = hit.status === 'forbidden' ? 'glossary-hit glossary-hit--forbidden' : 'glossary-hit'
    out += `<mark class="${cls}" data-term-id="${escapeAttr(hit.termId)}" data-target="${escapeAttr(hit.targetTerm)}" title="${escapeAttr(hit.targetTerm)}">${escapeHtml(text.slice(hit.start, hit.end))}</mark>`
    cursor = hit.end
  }
  out += escapeHtml(text.slice(cursor))
  return out
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, '&#39;')
}

export function statusLabel(status: GlossaryTermStatus): GlossaryTermStatus {
  return status === 'forbidden' ? 'forbidden' : 'approved'
}
