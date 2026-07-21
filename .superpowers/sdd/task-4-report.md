# Task 4 report: Promote-on-attach client + member pull in job/editor

## Status

Complete on `feature/cloud-tm-bases-share` (including P1 owned-catalog fallback fix).

Commits:

- `a69edbf feat: promote TM on job attach and sync shared bases for members`
- `3b4eb86 fix: preserve TM ownership and shared attachments`
- `4bd4f4d fix: merge local owned TM catalog when cloud list fails during job sync`

## Implemented

- `createJobTmAttachment` promotes units via `syncTmBase(tmBaseId, { pushOnly: true })` after attach.
- `JobMemoriesPanel` and `EditorPage` upsert shared base metadata and pull readable job attachments with `syncTmBase(id, { jobId })`.
- `upsertSharedTmBase` caches shared-only catalog rows without deleting owned entries.
- `syncTm({ jobId })` routes owned dirty buckets without `?jobId=`; shared buckets use job context.
- `syncTmBase({ jobId })` uses `listOwnedTmBaseIds()` for ownership routing and pushes stray owned dirty buckets.
- `JobMemoriesPanel` keeps listed attachments visible when per-base hydration fails.

## Verification (prior commits)

- `tests/jobs/tmAttachmentsApi.test.ts` — promote path after create
- `tests/components/JobMemoriesPanel.test.ts` — shared pull + hydration failure resilience
- `tests/tm/sync.base.test.ts` — job-context push routing for owned vs shared bases

## P1 fix: local owned catalog fallback in `syncTm({ jobId })`

### Problem

When `listTmBasesApi()` failed inside `syncTm({ jobId })`, `ownedBaseIds` was reset to an empty `Set`. Locally owned dirty bases were then bucketed and pushed with `?jobId=`, causing 403/404 on the owner path.

### Fix

- Seed `ownedBaseIds` from `listOwnedTmBaseIds()` (local `tmBasesIdb` rows where `sharedOnly !== true`).
- Merge cloud catalog ids on successful `listTmBasesApi()`; on failure, retain the local owned set.

### TDD evidence

Added regression: `listTmBasesApi` throws → `syncTm({ pushOnly: true, jobId })` still POSTs owned dirty to `/api/tm/bases/{id}/sync` without `?jobId=`.

- `npm test -- --pool=threads tests/tm/sync.base.test.ts`
  - 1 file passed, 11 tests passed

### Files changed

- `src/tm/sync.ts`
- `tests/tm/sync.base.test.ts`
