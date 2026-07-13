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
}

export type TmMatchKind = 'exact' | 'fuzzy' | 'fragment'

export interface TmMatch {
  target: string
  kind: TmMatchKind
  score: number
  /** Source fragment that produced the match (fragment mode). */
  matchedFragment?: string
}

export interface TmMatchOptions {
  punctuationMode?: 'strict' | 'soft'
  fuzzyMinScore?: number
  enableFragments?: boolean
}
