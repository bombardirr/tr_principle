# Cloud TM Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Incremental cloud TM replica sync (local match, Postgres truth, tombstone deletes).

**Architecture:** `GET/POST /api/tm/sync` with JWT; client dirty-set + pull-on-login; LWW by `updatedAt`.

**Tech Stack:** Go + pgx, Vue/TS, IndexedDB (`tmIdb`), existing `apiFetch`.

**Spec:** `docs/superpowers/specs/2026-07-14-cloud-tm-sync-design.md`

## Global Constraints

- Local fuzzy match only — no server lookup
- Scope all SQL by authenticated `user_id`
- Soft-delete via `deletedAt`; match ignores tombstones
- No outbox table; dirty ids in localStorage

---

## File map

| File | Responsibility |
|------|----------------|
| `api/migrations/004_tm_units.sql` | Table + indexes |
| `api/internal/tm/unit.go` | Wire types |
| `api/internal/tm/store.go` | Pull/push LWW |
| `api/internal/tm/handlers.go` | HTTP |
| `api/internal/tm/sync_test.go` | Integration tests |
| `api/internal/httpapi/router.go` | Mount `/api/tm` |
| `api/cmd/server/main.go` | Wire store/handler |
| `src/types/tm.ts` | `deletedAt?` |
| `src/storage/tmIdb.ts` | Tombstones, get-by-id, filter |
| `src/tm/sync.ts` | Cursor, dirty, pull/push |
| `src/tm/api.ts` | HTTP helpers |
| `src/auth/session.ts` | Sync after login |
| `src/pages/EditorPage.vue` | Mark dirty after writes |

---

### Task 1: Migration + API pull/push (TDD)

- [ ] Add failing integration test: push unit → pull since epoch returns it; older push discarded; tombstone returned; other user empty
- [ ] Migration `004_tm_units.sql`
- [ ] Implement `tm` package + router + main wiring
- [ ] Tests green (`DATABASE_URL` against local compose)
- [ ] Commit

### Task 2: Client IDB tombstones + types

- [ ] `deletedAt` on `TmUnit`
- [ ] `deleteTmForSegmentSource` → tombstone; `listTmUnits` filter active; `getTmUnit` / `putTmUnit` for sync
- [ ] Unit tests if any for filter; commit

### Task 3: Sync client + wire

- [ ] `src/tm/api.ts` + `src/tm/sync.ts` (dirty, since, syncTm)
- [ ] Call `syncTm` after login/register/bootstrap
- [ ] After TM write/delete/import in EditorPage → `markTmDirty` + debounced push
- [ ] Commit

### Task 4: Verify

- [ ] `go test` + `npm test` / typecheck
- [ ] Manual smoke if API up
