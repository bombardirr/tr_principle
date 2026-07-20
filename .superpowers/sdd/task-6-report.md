# Task 6 Report: JobMemoriesPanel — two layers + owner ACL

## Status

Complete.

## Commit

- `28d7e9f` — `feat: wire Job memories to server TM attachments`

## Implementation

- Split `JobMemoriesPanel` into server-backed **Job bases** and browser-local **My extras** sections.
- Kept the personal TM row unchanged.
- Shared attachments load through `listJobTmAttachmentsApi`.
- Shared create, permission patch, and delete operations use the server API.
- Shared rows use attachment UUIDs for Vue keys and mutation calls; labels and catalog styling use `tmBaseId`.
- Only owners see the shared add and detach controls or can change shared Read/Write flags.
- Translators/viewers receive disabled shared Read/Write controls.
- Every role can add, detach, and change Read/Write flags in the local overlay.
- The collection picker tracks whether an attachment is being added to the shared or local layer.
- No local-to-server migration was added.
- Export and Clone controls were not added.
- Added the five requested RU/EN translation keys.

## TDD

The rewritten component suite was run before production changes and failed all five tests for the expected missing behavior:

- missing two-layer headings and empty states;
- shared add visible to non-owner;
- shared add did not call the server;
- shared ACL controls absent;
- local add control absent.

After implementation, the focused suites passed:

```text
tests/components/JobMemoriesPanel.test.ts  5 passed
tests/tm/jobAttachments.test.ts            3 passed
```

Coverage includes initial shared loading, owner-only shared add, server create/patch/delete calls, UUID-based shared mutations, disabled member controls, and member-local attachment behavior.

## Verification

- `npm test` — 50 files passed, 212 tests passed.
- `npm run build` — `vue-tsc` and Vite production build passed.
- Focused Prettier check — passed.
- `git diff --check` — passed (Git only reported the repository's LF-to-CRLF checkout warning).
- IDE diagnostics for all four edited implementation/test files — no errors.

## Self-review

Reviewed commit `28d7e9f` against the Task 6 brief.

- Owner ACL is enforced both in rendering and handler guards.
- Shared mutation identifiers are attachment UUIDs, not TM base IDs.
- Shared display data comes from `tmBaseId`.
- Local and shared picker attachment sets remain independent.
- Only Read/Write permissions are rendered.
- No blocking or important findings found.

## Concerns

- The picker catalog currently contains only `personal-tm`; unknown server `tmBaseId` values still render safely as their raw ID, but cannot be newly selected until the catalog exposes them.
- Pre-existing `.superpowers/sdd` files and the modified Task 5 report were intentionally excluded from the implementation commit.

## Important review fixes

- Added job and request generation guards so stale shared-list responses cannot replace the current job's attachments.
- Shared create, patch, and delete handlers now capture the active job generation and ignore responses or errors after navigation to another job.
- Failed mutations still reconcile the shared list, but the reconciliation preserves the mutation error so inline feedback remains visible.
- Added regressions for cross-job list races, stale mutation responses, and mutation-error persistence.

## Review-fix verification

- RED: focused suite failed the three new regressions against the reviewed implementation.
- GREEN: `npx vitest run tests/components/JobMemoriesPanel.test.ts` — 1 file passed, 8 tests passed.
