# Task 5 Report: HTTP projects, members, invites

## Status

Implemented the shared-project collaboration HTTP API.

## Delivered

- Added authenticated project creation, listing, retrieval, and owner-only patching.
- Added member listing and owner-only removal; member responses expose only `userId`,
  `displayName`, and `role`, never email.
- Added owner-only link-invite creation, listing, patching, revocation, and authenticated
  invite acceptance. Invite creation returns the raw token once and all subsequent invite
  responses omit its hash.
- Added collaboration store queries and mutations for projects, memberships, and invites.
- Wired the collaboration handler into the server and every `httpapi.NewRouter` test setup
  without changing the existing lock or backup routes.
- Added the create → invite → accept → list-members integration test.

## Verification

Run from `api/`:

- `go test ./internal/collab/...` — passed. The database-backed tests skipped because
  `DATABASE_URL` is not set.
- `go test ./...` — passed. Database-backed integration tests skipped for the same reason.
- IDE diagnostics reported no lint errors in edited files.

## Constraints

The requested end-to-end HTTP test is present and skips cleanly without `DATABASE_URL`; it
was not exercised against a live database in this environment.

## Review fix: non-trailing-slash project routes

**Finding:** Collab project routes were registered with `r.Post("/", ...)` / `r.Get("/", ...)`
inside `Route("/api/projects")`, which only matched paths with a trailing slash (e.g.
`POST /api/projects/`), not the spec paths `POST|GET /api/projects` and
`GET|PATCH /api/projects/{id}`.

**Fix:** Replaced the nested `Route("/api/projects")` block with explicit full-path
registrations in a single authenticated `Group`:

- `POST|GET /api/projects`
- `GET|PATCH /api/projects/{projectID}`
- Nested members/invites routes use full paths (e.g. `/api/projects/{projectID}/members`).
- Lock/backup routes under `/api/projects/{projectID}/lock|backup` unchanged.
- `/api/invites/accept` unchanged.

**Test:** Added `TestProjectRoutes_NoTrailingSlash` in `api/internal/httpapi/router_test.go`
— a non-DB smoke test that asserts `GET|POST /api/projects` and `GET|PATCH
/api/projects/{id}` (no trailing slash) return 401 (auth middleware ran), not 404.

```text
$ go test ./internal/httpapi/... -v -run TestProjectRoutes_NoTrailingSlash
=== RUN   TestProjectRoutes_NoTrailingSlash
=== RUN   TestProjectRoutes_NoTrailingSlash/GET_/api/projects
=== RUN   TestProjectRoutes_NoTrailingSlash/POST_/api/projects
=== RUN   TestProjectRoutes_NoTrailingSlash/GET_/api/projects/test-id
=== RUN   TestProjectRoutes_NoTrailingSlash/PATCH_/api/projects/test-id
--- PASS: TestProjectRoutes_NoTrailingSlash (0.00s)
PASS
ok  	github.com/bombardirr/tr_principle/api/internal/httpapi	0.525s
```
