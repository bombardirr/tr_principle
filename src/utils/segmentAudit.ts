import type { Segment, SegmentAuditEntry, SegmentOrigin } from '@/types/project'

export const SEGMENT_AUDIT_MAX = 40
export const SEGMENT_AUDIT_COALESCE_MS = 3000
/** Cap stored before/after text to keep projects lean. */
export const SEGMENT_AUDIT_TEXT_MAX = 500
export const SEGMENT_AUDIT_SNIPPET_MAX = 36

export function clipAuditText(text: string, max = SEGMENT_AUDIT_TEXT_MAX): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}…`
}

export function auditSnippet(text: string | undefined, max = SEGMENT_AUDIT_SNIPPET_MAX): string {
  const t = (text ?? '').replace(/\s+/g, ' ').trim()
  if (!t) return ''
  if (t.length <= max) return t
  return `${t.slice(0, Math.max(1, max - 1))}…`
}

export function appendSegmentAudit(
  audit: SegmentAuditEntry[] | undefined,
  entry: {
    action: SegmentOrigin
    by?: string
    detail?: string
    at?: string
    before?: string
    after?: string
  },
  options?: { coalesceMs?: number; max?: number },
): SegmentAuditEntry[] {
  const at = entry.at ?? new Date().toISOString()
  const coalesceMs = options?.coalesceMs ?? SEGMENT_AUDIT_COALESCE_MS
  const max = options?.max ?? SEGMENT_AUDIT_MAX
  const list = [...(audit ?? [])]
  const last = list[list.length - 1]
  const before =
    entry.before === undefined ? undefined : clipAuditText(entry.before)
  const after = entry.after === undefined ? undefined : clipAuditText(entry.after)

  if (
    entry.action === 'manual' &&
    last?.action === 'manual' &&
    Date.parse(at) - Date.parse(last.at) < coalesceMs
  ) {
    list[list.length - 1] = {
      ...last,
      at,
      by: entry.by ?? last.by,
      detail: entry.detail ?? last.detail,
      // Keep original "before"; refresh "after" as typing continues.
      before: last.before ?? before,
      after: after ?? last.after,
    }
  } else {
    list.push({
      at,
      action: entry.action,
      by: entry.by,
      detail: entry.detail,
      before,
      after,
    })
  }

  if (list.length <= max) return list
  return list.slice(list.length - max)
}

export function withSegmentAudit(
  segment: Segment,
  entry: {
    action: SegmentOrigin
    by?: string
    detail?: string
    at?: string
    before?: string
    after?: string
  },
): Pick<Segment, 'audit'> {
  return { audit: appendSegmentAudit(segment.audit, entry) }
}
