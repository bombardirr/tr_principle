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

export type TmMatchKind = 'exact' | 'fuzzy'

export interface TmMatch {
  target: string
  kind: TmMatchKind
  score: number
}
