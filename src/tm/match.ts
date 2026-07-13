import type { TmMatch, TmUnit } from '@/types/tm'
import { normalizeTmSource, tmLookupKey } from './normalize'

const FUZZY_MIN_SCORE = 0.85

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const row = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) row[j] = j

  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]!
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]!
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + cost)
      prev = tmp
    }
  }
  return row[b.length]!
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0
  const dist = levenshtein(a, b)
  return 1 - dist / Math.max(a.length, b.length)
}

function langsMatch(
  unit: TmUnit,
  sourceLang?: string,
  targetLang?: string,
): boolean {
  if (sourceLang && unit.sourceLang && unit.sourceLang !== sourceLang) return false
  if (targetLang && unit.targetLang && unit.targetLang !== targetLang) return false
  return true
}

export function findExactTmMatch(
  units: TmUnit[],
  source: string,
  sourceLang?: string,
  targetLang?: string,
): TmMatch | null {
  const key = tmLookupKey(source, sourceLang, targetLang)
  const hits = units.filter(
    (unit) => unit.sourceKey === key && langsMatch(unit, sourceLang, targetLang),
  )
  if (!hits.length) return null
  hits.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return { target: hits[0]!.target, kind: 'exact', score: 1 }
}

export function findTmMatch(
  units: TmUnit[],
  source: string,
  sourceLang?: string,
  targetLang?: string,
): TmMatch | null {
  const exact = findExactTmMatch(units, source, sourceLang, targetLang)
  if (exact) return exact

  const needle = normalizeTmSource(source)
  if (!needle) return null

  let best: TmMatch | null = null
  for (const unit of units) {
    if (!langsMatch(unit, sourceLang, targetLang)) continue
    const score = similarity(needle, normalizeTmSource(unit.source))
    if (score < FUZZY_MIN_SCORE) continue
    if (!best || score > best.score) {
      best = { target: unit.target, kind: 'fuzzy', score }
    }
  }
  return best
}
