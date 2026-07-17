# Task 7 report: Client invite accept page and project members UI

## Delivered

- Added authenticated `/invite/:token` route and acceptance page. It accepts the link, pulls the
  shared snapshot into local IndexedDB, then opens the project editor.
- Added owner/member collaboration panel for cloud-shared projects:
  - Link invites with editor or viewer access.
  - Open, one-time, and expiring links.
  - Immediate copyable link after creation, invite revocation, member listing, and owner-only
    member removal.
  - Members can view the member list; owner controls remain hidden for non-owners.
- Added client collaboration API methods and English/Russian strings.
- The member UI only renders display names and roles; it never renders email addresses.

## Verification

- `npm run test` — passed: 35 files, 151 tests.
- `npm run build` — passed.
- `npm run test -- tests/projects/collabApi.test.ts` — red before API implementation, then passed:
  2 tests.
- IDE diagnostics — no errors in edited files.

## Concern

`npm run format:check` currently fails across 64 existing source files, including files unrelated
to this task. No bulk formatting was applied so existing uncommitted work was not altered.
