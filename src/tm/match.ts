import { tagMismatchPenalty, tagsMatch } from '@/docx/tags'
import type { TmMatch, TmMatchOptions, TmUnit } from '@/types/tm'
import { splitTmFragments, plainSource } from './fragments'
import { normalizeTmForMatch, normalizeTmSource, tmLookupKey } from './normalize'
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

/** Exact text (after normalize) and identical `{n}` tag sequence. */
function isExactMatch(
  source: string,
  unit: TmUnit,
  punctuationMode: TmPunctuationMode,
): boolean {
  return isExactSource(source, unit, punctuationMode) && tagsMatch(source, unit.source)
}

function fuzzyScore(
  needle: string,
  unitSource: string,
  punctuationMode: TmPunctuationMode,
): number {
  const base = similarity(
    normalizeTmForMatch(needle, punctuationMode),
    normalizeTmForMatch(unitSource, punctuationMode),
  )
  return Math.max(0, base - tagMismatchPenalty(needle, unitSource))
}

function neighborsEqual(a?: string | null, b?: string | null): boolean {
  return normalizeTmSource(a ?? '') === normalizeTmSource(b ?? '')
}

/** Exact source + same prev/next neighbors as when the TU was saved → 101%. */
export function isContextMatch(
  unit: TmUnit,
  contextBefore?: string,
  contextAfter?: string,
): boolean {
  // Legacy / fragment TUs without stored neighbors stay plain exact.
  if (unit.contextBefore == null && unit.contextAfter == null) return false
  return (
    neighborsEqual(unit.contextBefore, contextBefore) &&
    neighborsEqual(unit.contextAfter, contextAfter)
  )
}

function toExactOrContextMatch(
  unit: TmUnit,
  contextBefore?: string,
  contextAfter?: string,
): TmMatch {
  if (isContextMatch(unit, contextBefore, contextAfter)) {
    return {
      target: unit.target,
      kind: 'context',
      score: 1.01,
      ...matchMeta(unit),
    }
  }
  return {
    target: unit.target,
    kind: 'exact',
    score: 1,
    ...matchMeta(unit),
  }
}

function pickBestExact(
  needle: string,
  hits: TmUnit[],
  punctuationMode: TmPunctuationMode,
  contextBefore?: string,
  contextAfter?: string,
): TmMatch | null {
  if (!hits.length) return null
  const ranked = [...hits].sort((a, b) => {
    const aCtx = isContextMatch(a, contextBefore, contextAfter) ? 1 : 0
    const bCtx = isContextMatch(b, contextBefore, contextAfter) ? 1 : 0
    if (bCtx !== aCtx) return bCtx - aCtx

    const aLiteral = normalizeTmSource(needle) === normalizeTmSource(a.source) ? 1 : 0
    const bLiteral = normalizeTmSource(needle) === normalizeTmSource(b.source) ? 1 : 0
    if (bLiteral !== aLiteral) return bLiteral - aLiteral

    if (punctuationMode === 'soft') {
      const aPunct = trailingPunctAffinity(needle, a.source)
      const bPunct = trailingPunctAffinity(needle, b.source)
      if (bPunct !== aPunct) return bPunct - aPunct
    }

    return b.updatedAt.localeCompare(a.updatedAt)
  })
  return toExactOrContextMatch(ranked[0]!, contextBefore, contextAfter)
}

/** Prefer TU whose trailing punctuation closest to the needle (for soft-mode ties). */
function trailingPunctAffinity(needle: string, unitSource: string): number {
  const n = needle.trim()
  const u = unitSource.trim()
  const nTrail = n.match(/[.?!…]$/)?.[0] ?? ''
  const uTrail = u.match(/[.?!…]$/)?.[0] ?? ''
  if (nTrail === uTrail) return 3
  if (!nTrail && uTrail === '.') return 2
  if (!nTrail && !uTrail) return 2
  if (nTrail && uTrail === nTrail) return 3
  return 1
}

function findExactForNeedle(
  units: TmUnit[],
  needle: string,
  sourceLang: string | undefined,
  targetLang: string | undefined,
  punctuationMode: TmPunctuationMode,
  extras?: Partial<TmMatch>,
  contextBefore?: string,
  contextAfter?: string,
): TmMatch | null {
  const hits = units.filter(
    (unit) =>
      langsMatch(unit, sourceLang, targetLang) &&
      isExactMatch(needle, unit, punctuationMode),
  )
  const exact = pickBestExact(needle, hits, punctuationMode, contextBefore, contextAfter)
  if (!exact) return null
  return extras ? { ...exact, ...extras } : exact
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
    const score = fuzzyScore(needle, unit.source, punctuationMode)
    if (score < fuzzyMinScore) continue
    if (!best || score > best.score) {
      best = {
        target: unit.target,
        kind: extras?.kind ?? 'fuzzy',
        score,
        ...matchMeta(unit),
        ...extras,
      }
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
  contextBefore?: string,
  contextAfter?: string,
): TmMatch | null {
  const exact = findExactForNeedle(
    units,
    needle,
    sourceLang,
    targetLang,
    punctuationMode,
    matchedFragment ? { matchedFragment } : undefined,
    matchedFragment ? undefined : contextBefore,
    matchedFragment ? undefined : contextAfter,
  )
  if (exact) {
    if (matchedFragment) {
      return {
        ...exact,
        kind: 'fragment',
        matchedFragment,
        score: 1,
      }
    }
    return exact
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
  if (a.kind === 'context') return a
  if (b.kind === 'context') return b
  if (a.kind === 'exact') return a
  if (b.kind === 'exact') return b
  return a
}

function matchMeta(unit: TmUnit): Partial<TmMatch> {
  return {
    unitId: unit.id,
    createdBy: unit.createdBy,
    updatedBy: unit.updatedBy,
    createdAt: unit.createdAt,
    updatedAt: unit.updatedAt,
    contextBefore: unit.contextBefore,
    contextAfter: unit.contextAfter,
  }
}

/** All units at/above threshold for a (sentence) source — for picker UI. */
export function findTmMatches(
  units: TmUnit[],
  source: string,
  sourceLang?: string,
  targetLang?: string,
  options?: TmMatchOptions,
): TmMatch[] {
  const punctuationMode = options?.punctuationMode ?? TM_SETTINGS_DEFAULT.punctuationMode
  const fuzzyMinScore = options?.fuzzyMinScore ?? TM_SETTINGS_DEFAULT.fuzzyMinScore
  const results: TmMatch[] = []

  for (const unit of units) {
    if (!langsMatch(unit, sourceLang, targetLang)) continue
    if (isExactMatch(source, unit, punctuationMode)) {
      results.push(
        toExactOrContextMatch(unit, options?.contextBefore, options?.contextAfter),
      )
      continue
    }
    const score = fuzzyScore(source, unit.source, punctuationMode)
    if (score >= fuzzyMinScore) {
      results.push({
        target: unit.target,
        kind: 'fuzzy',
        score,
        ...matchMeta(unit),
      })
    }
  }

  return results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (a.kind === 'context' && b.kind !== 'context') return -1
    if (b.kind === 'context' && a.kind !== 'context') return 1
    if (a.kind === 'exact' && b.kind !== 'exact') return -1
    if (b.kind === 'exact' && a.kind !== 'exact') return 1
    return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
  })
}

export function findExactTmMatch(
  units: TmUnit[],
  source: string,
  sourceLang?: string,
  targetLang?: string,
  options?: Pick<TmMatchOptions, 'punctuationMode' | 'contextBefore' | 'contextAfter'>,
): TmMatch | null {
  const punctuationMode = options?.punctuationMode ?? 'strict'
  return findExactForNeedle(
    units,
    source,
    sourceLang,
    targetLang,
    punctuationMode,
    undefined,
    options?.contextBefore,
    options?.contextAfter,
  )
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
    undefined,
    options?.contextBefore,
    options?.contextAfter,
  )

  const wholeNormalized = normalizeTmForMatch(source, punctuationMode)
  const shouldTryFragments =
    enableFragments &&
    splitTmFragments(source).length > 1 &&
    (!best || (best.kind !== 'exact' && best.kind !== 'context'))

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

/** Build target text to apply — replaces each matched sentence fragment in multi-sentence segments. */
export function buildTmApplyTarget(
  units: TmUnit[],
  source: string,
  sourceLang?: string,
  targetLang?: string,
  options?: TmMatchOptions,
): string | null {
  const punctuationMode = options?.punctuationMode ?? TM_SETTINGS_DEFAULT.punctuationMode
  const fuzzyMinScore = options?.fuzzyMinScore ?? TM_SETTINGS_DEFAULT.fuzzyMinScore
  const enableFragments = options?.enableFragments ?? TM_SETTINGS_DEFAULT.enableFragments
  const plain = plainSource(source)
  const fragments = splitTmFragments(source)

  if (fragments.length <= 1 || !enableFragments) {
    return findTmMatch(units, source, sourceLang, targetLang, options)?.target ?? null
  }

  // Sentence-level matches only — skip whole-segment TUs so a bad
  // "composite → one sentence" entry cannot hijack every fragment.
  const wholeNorm = normalizeTmForMatch(plain, punctuationMode)
  const fragmentUnits = units.filter(
    (unit) =>
      normalizeTmForMatch(unit.source, punctuationMode) !== wholeNorm,
  )

  let cursor = 0
  let out = ''
  let matchedCount = 0

  for (const fragment of fragments) {
    const pos = plain.indexOf(fragment, cursor)
    if (pos === -1) {
      out += fragment
      continue
    }
    if (pos > cursor) out += plain.slice(cursor, pos)

    const hit = findMatchForNeedle(
      fragmentUnits,
      fragment,
      sourceLang,
      targetLang,
      punctuationMode,
      fuzzyMinScore,
      'fragment',
      fragment,
    )
    if (hit) {
      out += hit.target
      matchedCount++
    } else {
      out += fragment
    }
    cursor = pos + fragment.length
  }

  if (cursor < plain.length) out += plain.slice(cursor)

  if (matchedCount > 0) return out.trim()

  // No sentence TUs — fall back to whole-segment match.
  return (
    findTmMatch(units, source, sourceLang, targetLang, {
      ...options,
      enableFragments: false,
    })?.target ?? null
  )
}
