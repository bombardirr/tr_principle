import { packProjectFile } from '@/storage/projectFile'
import type { ProjectRecord } from '@/types/project'
import { putProjectBackup } from '@/projects/api'

let timer: ReturnType<typeof setTimeout> | null = null
let inflight: Promise<void> | null = null

export function scheduleProjectBackup(record: ProjectRecord, delayMs = 4000) {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    void pushProjectBackup(record)
  }, delayMs)
}

export async function pushProjectBackup(record: ProjectRecord): Promise<void> {
  if (inflight) {
    await inflight
  }
  const run = (async () => {
    const blob = await packProjectFile(record)
    await putProjectBackup(record.meta.id, blob)
  })()
  inflight = run.finally(() => {
    if (inflight === run) inflight = null
  })
  await inflight
}
