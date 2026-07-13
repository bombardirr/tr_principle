import type { TmMatch, TmMatchOptions, TmUnit } from '@/types/tm'
import { splitTmFragments } from './fragments'
import { normalizeTmForMatch, tmLookupKey } from './normalize'
import { TM_SETTINGS_DEFAULT, type TmPunctuationMode } from './settings'

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

function isExactSource(
  source: string,
  unit: TmUnit,
  punctuationMode: TmPunctuationMode,
): boolean {
  if (punctuationMode === 'strict') {
    return unit.sourceKey === tmLookupKey(source, unit.sourceLang, unit.targetLang)
  }
  return (
    normalizeTmForMatch(source, punctuationMode) ===
    normalizeTmForMatch(unit.source, punctuationMode)
  )
}

function pickBestExact(
  hits: TmUnit[],
  extras?: Partial<TmMatch>,
): TmMatch | null {
  if (!hits.length) return null
  hits.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return { target: hits[0]!.target, kind: 'exact', score: 1, ...extras }
}

function findExactForNeedle(
  units: TmUnit[],
  needle: string,
  sourceLang: string | undefined,
  targetLang: string | undefined,
  punctuationMode: TmPunctuationMode,
  extras?: Partial<TmMatch>,
): TmMatch | null {
  const hits = units.filter(
    (unit) =>
      langsMatch(unit, sourceLang, targetLang) &&
      isExactSource(needle, unit, punctuationMode),
  )
  return pickBestExact(hits, extras)
}

function findFuzzyForNeedle(
  units: TmUnit[],
  needle: string,
  sourceLang: string | undefined,
  targetLang: string | undefined,
  punctuationMode: TmPunctuationMode,
  fuzzyMinScore: number,
  extras?: Partial<TmMatch>,
): TmMatch | null {
  const normalizedNeedle = normalizeTmForMatch(needle, punctuationMode)
  if (!normalizedNeedle) return null

  let best: TmMatch | null = null
  for (const unit of units) {
    if (!langsMatch(unit, sourceLang, targetLang)) continue
    const score = similarity(
      normalizedNeedle,
      normalizeTmForMatch(unit.source, punctuationMode),
    )
    if (score < fuzzyMinScore) continue
    if (!best || score > best.score) {
      best = { target: unit.target, kind: extras?.kind ?? 'fuzzy', score, ...extras }
    }
  }
  return best
}

function findMatchForNeedle(
  units: TmUnit[],
  needle: string,
  sourceLang: string | undefined,
  targetLang: string | undefined,
  punctuationMode: TmPunctuationMode,
  fuzzyMinScore: number,
  matchKind: TmMatch['kind'],
  matchedFragment?: string,
): TmMatch | null {
  const exact = findExactForNeedle(
    units,
    needle,
    sourceLang,
    targetLang,
    punctuationMode,
    matchedFragment ? { matchedFragment } : undefined,
  )
  if (exact) {
    return {
      ...exact,
      kind: matchedFragment ? 'fragment' : 'exact',
      matchedFragment,
    }
  }
  return findFuzzyForNeedle(
    units,
    needle,
    sourceLang,
    targetLang,
    punctuationMode,
    fuzzyMinScore,
    { kind: matchKind, matchedFragment },
  )
}

function betterMatch(a: TmMatch | null, b: TmMatch | null): TmMatch | null {
  if (!a) return b
  if (!b) return a
  if (b.score > a.score) return b
  if (b.score < a.score) return a
  if (a.kind === 'exact') return a
  if (b.kind === 'exact') return b
  return a
}

export function findExactTmMatch(
  units: TmUnit[],
  source: string,
  sourceLang?: string,
  targetLang?: string,
  options?: Pick<TmMatchOptions, 'punctuationMode'>,
): TmMatch | null {
  const punctuationMode = options?.punctuationMode ?? 'strict'
  return findExactForNeedle(units, source, sourceLang, targetLang, punctuationMode)
}

export function findTmMatch(
  units: TmUnit[],
  source: string,
  sourceLang?: string,
  targetLang?: string,
  options?: TmMatchOptions,
): TmMatch | null {
  const punctuationMode = options?.punctuationMode ?? TM_SETTINGS_DEFAULT.punctuationMode
  const fuzzyMinScore = options?.fuzzyMinScore ?? TM_SETTINGS_DEFAULT.fuzzyMinScore
  const enableFragments = options?.enableFragments ?? TM_SETTINGS_DEFAULT.enableFragments

  let best = findMatchForNeedle(
    units,
    source,
    sourceLang,
    targetLang,
    punctuationMode,
    fuzzyMinScore,
    'fuzzy',
  )

  const wholeNormalized = normalizeTmForMatch(source, punctuationMode)
  const shouldTryFragments =
    enableFragments &&
    splitTmFragments(source).length > 1 &&
    (!best || best.kind !== 'exact')

  if (shouldTryFragments) {
    for (const fragment of splitTmFragments(source)) {
      const fragmentNorm = normalizeTmForMatch(fragment, punctuationMode)
      if (!fragmentNorm || fragmentNorm === wholeNormalized) continue
      const hit = findMatchForNeedle(
        units,
        fragment,
        sourceLang,
        targetLang,
        punctuationMode,
        fuzzyMinScore,
        'fragment',
        fragment,
      )
      best = betterMatch(best, hit)
    }
  }

  return best
}
