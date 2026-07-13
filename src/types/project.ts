export type SegmentStatus = 'empty' | 'draft' | 'done'

export interface RunSpan {
  /** Indices of w:r elements (with text) within the paragraph, in document order */
  runIndices: number[]
  fingerprint: string
  text: string
}

export interface Segment {
  id: string
  storyKey: string
  storyFile: string
  paraIndex: number
  source: string
  target: string
  status: SegmentStatus
  inTable: boolean
  spans: RunSpan[]
}

export interface ProjectMeta {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  sourceLang?: string
  targetLang?: string
  segmentCount: number
  doneCount: number
}

export interface ProjectRecord {
  meta: ProjectMeta
  segments: Segment[]
  /** Original DOCX bytes */
  docx: ArrayBuffer
}
