export type SegmentStatus = 'empty' | 'draft' | 'done'

export type SegmentOrigin = 'manual' | 'tm' | 'copy-source' | 'leave-empty' | 'reset'

/** One append-only edit event for segment audit (MVP local history). */
export interface SegmentAuditEntry {
  at: string
  action: SegmentOrigin
  by?: string
  /** Short label, e.g. TM "101%" or "87%". */
  detail?: string
  /** Target text before the change (may be clipped). */
  before?: string
  /** Target text after the change (may be clipped). */
  after?: string
}

export interface RunSpan {
  /** Indices of w:r elements (with text) within the paragraph, in document order */
  runIndices: number[]
  fingerprint: string
  text: string
}

/**
 * Inclusive-exclusive ranges in target *plain* text (no `{n}` markers).
 * Mirrors common Word `w:rPr` props we round-trip (see `RunStyle` in runStyle.ts).
 */
export interface TargetStyleRange {
  start: number
  end: number
  bold?: boolean
  italic?: boolean
  /** Presence of underline; detail in underlineVal. */
  underline?: boolean
  /** Word w:u @w:val — single | double | thick | wave | … */
  underlineVal?: string
  font?: string
  fontSizePt?: number
  /** Hex RGB without #, as in Word w:color. */
  color?: string
  strike?: boolean
  doubleStrike?: boolean
  /** Word w:vertAlign — superscript | subscript */
  vertAlign?: 'superscript' | 'subscript'
  /** Word w:highlight @w:val — yellow | green | … */
  highlight?: string
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
  /** Translator overrides on plain target; absent = export via span identity / predominant. */
  targetStyles?: TargetStyleRange[]
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
  /** Recent edit events (capped); oldest dropped when over limit. */
  audit?: SegmentAuditEntry[]
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
  jobId?: string
  sourceFilename?: string
  sourceHash?: string
  tmAttachments?: ProjectTmAttachment[]
}

export type ProjectTmAttachmentId = 'personal-tm'

export interface ProjectTmAttachment {
  id: ProjectTmAttachmentId
  canRead: boolean
  canWrite: boolean
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
