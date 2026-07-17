# Task 6 report: Project segment sync, shared lock, and presence

## Delivered

- Added migration `010_project_sync_state.sql` for shared project snapshot state.
- Added authenticated shared-project sync, shared lock, and presence endpoints.
- Kept `/api/projects/{id}/lock` compatible with legacy solo locks when the caller is not a member of a shared project.
- Enforced editor/owner access for shared locks and writes; a second editor receives `409`.
- Added cloud project API/snapshot helpers and minimal EditorPage pull-on-open, push-after-save, and presence heartbeat wiring.
- Added `ProjectMeta.cloudShared` and preserved it in IndexedDB records.

## Verification

- `DATABASE_URL=postgres://appzac:appzac@localhost:55432/appzac?sslmode=disable go test ./...` — passed.
- `npm run build` — passed.
- `npm run test` — passed: 33 files, 147 tests.

## Scope notes

- Presence is process-local and expires after 45 seconds; it intentionally does not return email addresses.
- Sync is full-snapshot last-write-wins, with no OT or segment-level conflict resolution.
- No Task 7 invite UI or Task 8 project TM changes were added.

## Blocking review fixes

- `ClaimSharedLock` now uses a single conditional `INSERT ... ON CONFLICT DO UPDATE ... WHERE ... RETURNING` statement. An active lock can only be renewed by the same user and holder with its valid token; every other active claim receives `ErrSharedLockHeld`.
- Added a PostgreSQL-backed concurrent-claim regression test. It delays competing inserts so both callers contend for the same row, verifies exactly one successful claim, and confirms that the winner can renew its token.
- `useProjectAccess` now treats `401`, `403`, and `409` lock-claim API responses as non-editable. Network failures and server errors remain offline-friendly and editable.
- Added frontend regression coverage for both `401` and `403`.

## Review-fix verification

- `npm test -- tests/composables/useProjectAccess.test.ts` — first red run: 2 failures (401/403 incorrectly left `cloudOk=true`); after the fix: 2 passed.
- `cmd /c "set DATABASE_URL=postgres://appzac:appzac@localhost:55432/appzac?sslmode=disable&& go test ./internal/collab -run TestClaimSharedLockAtomicallyExcludesConcurrentClaims -count=1"` — passed.
- `npm test` — passed: 34 files, 149 tests.
- `cmd /c "set DATABASE_URL=postgres://appzac:appzac@localhost:55432/appzac?sslmode=disable&& go test ./..."` — passed.
- `npm run build` — passed.
