export type SegmentStatus = 'empty' | 'draft' | 'done'

export type SegmentOrigin = 'manual' | 'tm' | 'copy-source' | 'leave-empty' | 'reset'

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
  /** Visual + export group: sentences of one Word paragraph share this key. */
  paragraphKey: string
  /** 0..n-1 within paragraph */
  sentenceIndex: number
  source: string
  target: string
  status: SegmentStatus
  inTable: boolean
  inTextbox: boolean
  inCaption: boolean
  spans: RunSpan[]
  /** Full paragraph spans for DOCX write-back (shared across sentence siblings). */
  paragraphSpans?: RunSpan[]
  updatedAt?: string
  updatedBy?: string
  origin?: SegmentOrigin
  /** @deprecated Composite TM defer — remove after sentence UX rewrite. */
  tmSavePending?: boolean
}

export type LangCode = 'ru' | 'en' | 'en-GB'

export interface ProjectMeta {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  sourceLang?: LangCode | string
  targetLang?: LangCode | string
  fuzzyMinScore?: number
  tmAutoSave?: boolean
  settingsConfirmedAt?: string
  /** 1 = paragraph segments (legacy); 2 = sentence segments */
  segmentSchemaVersion?: number
  segmentCount: number
  doneCount: number
}

export interface ProjectRecord {
  meta: ProjectMeta
  segments: Segment[]
  /** Original DOCX bytes */
  docx: ArrayBuffer
}

export const SEGMENT_SCHEMA_SENTENCE = 2
/** Sentence schema + date-safe splitter (no shredding of 30.03.2026). */
export const SEGMENT_SCHEMA_DATE_SAFE = 3
export const SEGMENT_SCHEMA_PARAGRAPH = 1
