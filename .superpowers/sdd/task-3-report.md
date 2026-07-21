# Task 3 report: Client per-base sync + owned catalog sync

## Status

Complete on `feature/cloud-tm-bases-share`. Task 4 was not started.

Commit: `212d893 feat: per-base TM sync and cloud catalog for owned bases`

## Implemented

- Added client wrappers for owned base catalog list/upsert and per-base pull/push.
- Added optional `jobId` query support to the per-base wrappers and `syncTmBase`; no member job pull orchestration or UI was added.
- Scoped TM cursors and dirty sets by account, base, and optional job:
  - `appzac-tm-sync-since:{account}:{baseId}[:{jobId}]`
  - `appzac-tm-sync-dirty:{account}:{baseId}[:{jobId}]`
- Changed `markTmDirty(...ids)` to load units, group IDs by `unit.baseId` (falling back to `personal-tm`), persist each bucket, and schedule a push.
- Added `syncTmBase(baseId, { jobId?, pushOnly? })` with paginated pull, LWW merge, tombstone handling, and bucket-specific push.
- Changed login-triggered `syncTm()` orchestration to fetch the owned cloud catalog, upsert it into IndexedDB, pull each owned base, then push all non-job dirty base buckets.
- Changed local `createTmBase` to POST the created ID, label, and color to `/api/tm/bases`. Local creation remains available if that request fails.
- Left `session.ts` unchanged because its existing login/bootstrap call to `syncTm()` now performs catalog hydration.

## TDD evidence

Added `tests/tm/sync.base.test.ts` first. The initial focused run failed for the expected missing behavior:

- `syncTmBase is not a function`
- cloud catalog row was absent locally
- local catalog creation made no API call

The implementation then made all four focused tests pass. Coverage includes named-base POST routing, remote-newer LWW merge, owned catalog hydration plus per-base pull, and catalog create POST.

## Verification

- `npm test -- --pool=threads tests/tm/sync.base.test.ts`
  - 1 file passed, 4 tests passed
- `npm test -- --pool=threads tests/tm/`
  - 17 files passed, 86 tests passed
- `npm run build`
  - `vue-tsc` passed
  - Vite production build passed
- IDE diagnostics reported no errors in the edited files.

## Files changed in commit

- `src/tm/api.ts`
- `src/tm/sync.ts`
- `src/storage/tmBasesIdb.ts`
- `tests/tm/sync.base.test.ts`

## Concerns

- Catalog creation is intentionally local-first: a failed POST is swallowed so offline creation still succeeds. There is no persistent catalog-outbox retry in Task 3; successful login sync hydrates server-owned bases but does not upload a previously failed local-only catalog row.
- Existing legacy `/api/tm/sync` wrappers remain exported for compatibility, but owned orchestration now uses only per-base endpoints.

## Important/High review fixes

- Made `markTmDirty(...ids)` synchronous by immediately recording unit IDs in an account-scoped global dirty set. Push-time bucketing resolves each unit's current `baseId`, preventing navigation from interrupting the dirty write.
- Changed dirty pushes to re-read persisted state after every successful request and remove only the pushed IDs, preserving IDs added while the request was in flight.
- Limited each per-base POST to 500 units and continued sending batches until the bucket was empty or a request failed.
- Isolated catalog, pull, and push failures so one base cannot prevent remaining dirty bases from being pushed.
- Added regression coverage for synchronous dirty marking, concurrent dirty writes during an in-flight push, 501-unit batching, and continuation after a base-specific failure.

### Review TDD evidence

The focused test run failed first with all three new regressions:

- in-flight dirty write: expected 2 POSTs, received 1
- 501 dirty units: expected 2 POSTs, received 1
- failed first base: second base POST was not attempted

After the fixes:

- `npm test -- --pool=threads tests/tm/sync.base.test.ts`
  - 1 file passed, 7 tests passed
- `npm test -- --pool=threads tests/tm/sync.base.test.ts tests/tm/`
  - 17 files passed, 89 tests passed
- `npm run build`
  - `vue-tsc` passed
  - Vite config loading was blocked by a Windows `spawn EPERM`; one retry exited before producing output
- IDE diagnostics reported no errors in `src/tm/sync.ts` or `tests/tm/sync.base.test.ts`.

Task 4 was not started.
