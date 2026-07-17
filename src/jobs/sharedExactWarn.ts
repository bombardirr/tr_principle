import type { TmMatch } from '@/types/tm'

function tmAuthor(match: TmMatch): string {
  return (match.updatedBy ?? match.createdBy ?? '').trim()
}

/** True when job TM has exact/context hit authored by someone other than current actor. */
export function shouldWarnSharedExact(
  jobTmHits: readonly TmMatch[],
  currentActor: string,
): boolean {
  const me = currentActor.trim()
  if (!me) return false
  return jobTmHits.some(hit => {
    if (hit.kind !== 'exact' && hit.kind !== 'context') return false
    const author = tmAuthor(hit)
    return author !== '' && author !== me
  })
}
