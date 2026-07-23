export interface TmUnit {
  id: string
  /** Which local/catalog TM base this unit belongs to. */
  baseId: string
  source: string
  target: string
  sourceKey: string
  sourceLang?: string
  targetLang?: string
  createdAt: string
  updatedAt: string
  /** ISO tombstone; set when unit is soft-deleted for cloud sync. */
  deletedAt?: string | null
  projectId?: string
  createdBy?: string
  updatedBy?: string
  /** Previous sentence source at save time (document order). */
  contextBefore?: string
  /** Next sentence source at save time. */
  contextAfter?: string
}

export type TmMatchKind = 'context' | 'exact' | 'fuzzy' | 'fragment'

export interface TmMatch {
  target: string
  kind: TmMatchKind
  score: number
  /** Source fragment that produced the match (fragment mode). */
  matchedFragment?: string
  unitId?: string
  /** Local TM base id the matched unit belongs to. */
  baseId?: string
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
  /** Previous segment source (document order) for 101% context match. */
  contextBefore?: string
  /** Next segment source (document order) for 101% context match. */
  contextAfter?: string
}
