export type GlossaryTermStatus = 'approved' | 'forbidden'

export interface GlossaryTerm {
  id: string
  sourceLang: string
  targetLang: string
  sourceTerm: string
  targetTerm: string
  status: GlossaryTermStatus
  note?: string
  caseSensitive: boolean
  createdAt: string
  updatedAt: string
  deletedAt?: string | null
  createdBy?: string
}

export type GlossaryHit = {
  start: number
  end: number
  termId: string
  status: GlossaryTermStatus
  sourceTerm: string
  targetTerm: string
}
