export interface TmUnit {
  id: string
  source: string
  target: string
  sourceKey: string
  sourceLang?: string
  targetLang?: string
  createdAt: string
  updatedAt: string
  projectId?: string
  createdBy?: string
  updatedBy?: string
  /** Previous sentence source at save time (document order). */
  contextBefore?: string
  /** Next sentence source at save time. */
  contextAfter?: string
}

export type TmMatchKind = 'exact' | 'fuzzy' | 'fragment'

export interface TmMatch {
  target: string
  kind: TmMatchKind
  score: number
  /** Source fragment that produced the match (fragment mode). */
  matchedFragment?: string
  unitId?: string
  createdBy?: string
  updatedBy?: string
  createdAt?: string
  updatedAt?: string
  contextBefore?: string
  contextAfter?: string
}

export interface TmMatchOptions {
  punctuationMode?: 'strict' | 'soft'
  fuzzyMinScore?: number
  enableFragments?: boolean
}
