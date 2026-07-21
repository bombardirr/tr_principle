import { PERSONAL_TM_ATTACHMENT_ID } from '@/tm/projectAttachments'
import {
  isJobEditorContext,
  resolveTmBaseAccess,
  type JobTmAccessRow,
  type TmBaseAccessInput,
} from '@/tm/tmAccess'

export type { JobTmAccessRow }
export { isJobEditorContext }

export type PersonalTmAccessInput = TmBaseAccessInput

export type PersonalTmAccess = {
  jobContext: boolean
  canRead: boolean
  canWrite: boolean
}

/**
 * Personal TM pool access (compat): project OR job layers for `personal-tm` only.
 * Prefer {@link resolveTmBaseAccess} for multi-base editors.
 */
export function resolvePersonalTmAccess(input: PersonalTmAccessInput): PersonalTmAccess {
  const access = resolveTmBaseAccess(input)
  return {
    jobContext: access.jobContext,
    canRead: access.readableBaseIds.includes(PERSONAL_TM_ATTACHMENT_ID),
    canWrite: access.writableBaseIds.includes(PERSONAL_TM_ATTACHMENT_ID),
  }
}
