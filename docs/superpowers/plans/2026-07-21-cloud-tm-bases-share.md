# Cloud TM Bases Job-Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote local TM bases to cloud on job attach and sync units so members with Read/Write match and write the **owner’s same base** — per [`2026-07-21-cloud-tm-bases-share-design.md`](../specs/2026-07-21-cloud-tm-bases-share-design.md).

**Architecture:** Postgres `tm_bases` + `tm_units.base_id`; per-base `GET/POST /api/tm/bases/{baseId}/sync` authorized by ownership or job attachment ACL (`?jobId=` for `personal-tm`). Client uses per-`(account, baseId[, jobId])` cursors/dirty; editor access sets unchanged.

**Tech Stack:** Go (chi, pgx, goose), Vue 3 + TypeScript, idb, Vitest, existing `apiFetch` / TM sync patterns.

## Global Constraints

- Writes always stored under **base owner** `user_id` (member is not row owner)
- Any base id including `personal-tm` may be attached
- Auto-promote catalog on attach; client pushes units immediately after
- No project cross-user sync; no Export/Clone UI; no standalone share ACL
- Legacy `GET/POST /api/tm/sync` remains owner bulk (stamp `baseId`); new paths use per-base sync
- Soft `job_tm_attachments.tm_base_id` (no FK)

## File map

| File | Role |
|------|------|
| `api/migrations/018_tm_bases.sql` | `tm_bases` + `tm_units.base_id` backfill |
| `api/internal/tm/unit.go` | `BaseID` on `Unit` |
| `api/internal/tm/store.go` | Pull/Upsert with `base_id`; PullByBase; EnsureBase |
| `api/internal/tm/bases.go` | Catalog CRUD store |
| `api/internal/tm/access.go` | Resolve owner + R/W for caller+baseId(+jobId) |
| `api/internal/tm/handlers.go` | Catalog + per-base sync handlers |
| `api/internal/tm/*_test.go` | Sync ACL + base_id migration behavior |
| `api/internal/jobs/attachment_handlers.go` | Ensure base on create; return label/color |
| `api/internal/httpapi/router.go` | Register `/api/tm/bases` routes |
| `src/tm/api.ts` | Catalog + per-base sync client |
| `src/tm/sync.ts` | Per-base since/dirty; `syncTmBase`; keep `syncTm` as multi-base orchestrator |
| `src/tm/basesApi.ts` | Optional thin catalog wrappers (or fold into `api.ts`) |
| `src/storage/tmBasesIdb.ts` | Upsert shared metadata; sync owned catalog |
| `src/jobs/tmAttachmentsApi.ts` | Promote push after create; parse label/color |
| `src/components/JobMemoriesPanel.vue` | Pull shared bases when list loads |
| `src/pages/EditorPage.vue` | On job context: pull readable shared bases |
| `src/types/job.ts` | Optional `label`/`color`/`ownerId` on attachment |
| tests | Client sync per-base; promote path mocked |

---

### Task 1: Migration + `base_id` on server units

**Files:**
- Create: `api/migrations/018_tm_bases.sql`
- Modify: `api/internal/tm/unit.go`, `api/internal/tm/store.go`
- Test: `api/internal/tm/sync_test.go` (extend)

**Interfaces:**
- Produces: `Unit.BaseID string` (`json:"baseId"`); `Store.UpsertLWW` writes `base_id` (default `personal-tm`); `Store.Pull` returns `baseId`; `Store.PullByBase(ctx, ownerID, baseID, since, limit)`; `Store.EnsureBase(ctx, ownerID, id, label, color)`

- [ ] **Step 1: Add migration**

```sql
-- +goose Up
CREATE TABLE IF NOT EXISTS tm_bases (
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  label TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#5b9fd4',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  PRIMARY KEY (owner_id, id)
);

ALTER TABLE tm_units
  ADD COLUMN IF NOT EXISTS base_id TEXT NOT NULL DEFAULT 'personal-tm';

UPDATE tm_units SET base_id = 'personal-tm' WHERE base_id IS NULL OR base_id = '';

CREATE INDEX IF NOT EXISTS tm_units_user_base_updated
  ON tm_units (user_id, base_id, updated_at);

INSERT INTO tm_bases (owner_id, id, label, color, created_at, updated_at)
SELECT DISTINCT user_id, 'personal-tm', 'Personal TM', '#5b9fd4', now(), now()
FROM tm_units
ON CONFLICT DO NOTHING;

-- +goose Down
DROP INDEX IF EXISTS tm_units_user_base_updated;
ALTER TABLE tm_units DROP COLUMN IF EXISTS base_id;
DROP TABLE IF EXISTS tm_bases;
```

- [ ] **Step 2: Extend `Unit` + store scan/upsert/pull**

Add `BaseID string \`json:"baseId"\`` to `Unit`. In `UpsertLWW`, if `unit.BaseID == ""` set `"personal-tm"`. Include `base_id` in INSERT/UPDATE. In `scanUnit` / `Pull`, select and return `baseId`. Add `PullByBase` filtering `user_id = $1 AND base_id = $2 AND updated_at > $3`.

- [ ] **Step 3: Extend existing sync test**

Push a unit **without** `baseId` → pull → assert `baseId == "personal-tm"`. Push with `baseId: "named-1"` → pull returns it. Run: `cd api && go test ./internal/tm/ -count=1`

- [ ] **Step 4: Commit**

```bash
git add api/migrations/018_tm_bases.sql api/internal/tm/
git commit -m "feat(api): add tm_bases and tm_units.base_id"
```

---

### Task 2: Catalog API + ACL resolve + per-base sync + promote on attach

**Files:**
- Create: `api/internal/tm/bases.go`, `api/internal/tm/access.go`
- Modify: `api/internal/tm/handlers.go`, `api/internal/httpapi/router.go`
- Modify: `api/internal/jobs/attachment_handlers.go`, `api/internal/jobs/attachments.go` (optional label fields)
- Test: `api/internal/tm/bases_sync_test.go` (new integration-style HTTP test like `sync_test.go`)

**Interfaces:**
- Produces:
  - `GET/POST/PATCH/DELETE /api/tm/bases`
  - `GET/POST /api/tm/bases/{baseId}/sync?since=&jobId=`
  - `ResolveBaseAccess(ctx, callerID, baseID, jobID?) → (ownerID, canRead, canWrite, err)`
  - `CreateTMAttachment` calls `EnsureBase` for job owner before insert
- Consumes: Task 1 store methods

- [ ] **Step 1: Catalog store**

```go
type Base struct {
  ID        string  `json:"id"`
  Label     string  `json:"label"`
  Color     string  `json:"color"`
  CreatedAt string  `json:"createdAt"`
  UpdatedAt string  `json:"updatedAt"`
  DeletedAt *string `json:"deletedAt,omitempty"`
}

func (s *Store) EnsureBase(ctx context.Context, ownerID uuid.UUID, id, label, color string) error
func (s *Store) ListBases(ctx context.Context, ownerID uuid.UUID) ([]Base, error) // omit deleted
func (s *Store) UpsertBase(...) error
func (s *Store) SoftDeleteBase(...) error // reject id == "personal-tm"
```

- [ ] **Step 2: Access resolver**

```go
// jobId optional except when baseID == "personal-tm" or multiple owners match.
func (s *Store) ResolveBaseAccess(ctx context.Context, caller uuid.UUID, baseID string, jobID *uuid.UUID) (owner uuid.UUID, canRead, canWrite bool, err error)
```

Logic:
1. If caller owns `(caller, baseID)` active catalog row → full R/W.
2. Else find job attachments where caller is member, `tm_base_id = baseID`, and (if `jobID` set) `job_id = jobID`. Base **owner** = that job’s `owner_id` (from `jobs` table). OR `can_read` / `can_write` across matches.
3. If `baseID == "personal-tm"` and `jobID == nil` → error `jobId required`.
4. If multiple distinct job owners match without `jobID` → error `jobId required`.
5. Unauthorized → `ErrForbidden`.

- [ ] **Step 3: Handlers + routes**

```go
// router
r.Get("/bases", tmHandler.ListBases)
r.Post("/bases", tmHandler.CreateBase)
r.Patch("/bases/{baseId}", tmHandler.PatchBase)
r.Delete("/bases/{baseId}", tmHandler.DeleteBase)
r.Get("/bases/{baseId}/sync", tmHandler.PullBase)
r.Post("/bases/{baseId}/sync", tmHandler.PushBase)
```

`PullBase` / `PushBase`: resolve access; pull/push against **owner** id; on push set `unit.BaseID = baseId` and `UpsertLWW(ownerID, unit)`. Member may set `updatedBy` to their display; do not change `user_id`.

Keep legacy `/sync` owner-only: when reading/writing, default missing `baseId` to `personal-tm`.

- [ ] **Step 4: Promote on attach**

In `CreateTMAttachment` after owner check, before/after `CreateAttachment`:

```go
_ = h.TM.EnsureBase(r.Context(), user.ID, body.TmBaseID, labelOrDefault(body), colorOrDefault)
```

Inject `TM *tm.Store` (or small interface) on `jobs.Handler`. Extend list/create JSON with `label`/`color` from `tm_bases` join on `(jobs.owner_id, tm_base_id)` so members see names.

- [ ] **Step 5: Tests**

Matrix:
- Owner pull/push own named base → 200
- Member with Read, `?jobId=` → GET 200, POST 403
- Member with Write → POST 200; unit stored under **owner** user_id
- Stranger → 403/404
- `personal-tm` without `jobId` → 400
- Attach ensures catalog row exists

Run: `cd api && go test ./internal/tm/ ./internal/jobs/ -count=1`

- [ ] **Step 6: Commit**

```bash
git add api/internal/tm/ api/internal/jobs/ api/internal/httpapi/router.go
git commit -m "feat(api): TM base catalog, per-base sync ACL, promote on attach"
```

---

### Task 3: Client per-base sync + owned catalog sync

**Files:**
- Modify: `src/tm/api.ts`, `src/tm/sync.ts`, `src/storage/tmBasesIdb.ts`, `src/auth/session.ts`
- Create: `src/tm/basesCloud.ts` (pull/push catalog helpers) — optional if folded into sync
- Test: `tests/tm/sync.base.test.ts` (mock `apiFetch`)

**Interfaces:**
- Consumes: `/api/tm/bases`, `/api/tm/bases/{id}/sync`
- Produces: `markTmDirty(...ids)` still works; internally groups by unit.`baseId`; `syncTmBase(baseId, opts?: { jobId?: string; pushOnly?: boolean })`; `syncTm()` pulls all **owned** bases then pushes all dirty

- [ ] **Step 1: API wrappers**

```ts
export async function pullTmBaseSync(baseId: string, since: string, jobId?: string)
export async function pushTmBaseSync(baseId: string, units: TmUnit[], jobId?: string)
export async function listTmBasesApi()
export async function upsertTmBaseApi(input: { id?: string; label: string; color?: string })
```

- [ ] **Step 2: Per-base since/dirty keys**

```ts
// appzac-tm-sync-since:{account}:{baseId}[:{jobId}]
// appzac-tm-sync-dirty:{account}:{baseId}[:{jobId}]
```

On `markTmDirty`, load each unit, bucket by `baseId` (default personal), add to that dirty set, schedule push.

`syncTm({ pushOnly })`: for owned catalog ids from `listTmBases()`, pull each (no jobId); then push every non-empty dirty bucket (owned bases without jobId).

- [ ] **Step 3: Catalog cloud sync**

On login (`session.ts` after `syncTm` or inside it): `GET /api/tm/bases` → upsert into `tmBasesIdb` (owned). Local `createTmBase` → also `POST /api/tm/bases`.

- [ ] **Step 4: Tests**

Mock fetch: dirty unit with `baseId: 'named-1'` calls `POST /api/tm/bases/named-1/sync`. Pull merges LWW. Run: `npm test -- --pool=threads tests/tm/sync.base.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/tm/api.ts src/tm/sync.ts src/storage/tmBasesIdb.ts src/auth/session.ts tests/tm/
git commit -m "feat: per-base TM sync and cloud catalog for owned bases"
```

---

### Task 4: Promote-on-attach client + member pull in job/editor

**Files:**
- Modify: `src/jobs/tmAttachmentsApi.ts`, `src/components/JobMemoriesPanel.vue`, `src/pages/EditorPage.vue`, `src/types/job.ts`
- Modify: `src/storage/tmBasesIdb.ts` — `upsertSharedTmBase({ id, label, color })` (no delete-own)
- Test: `tests/jobs/tmAttachmentsApi.test.ts`, `tests/components/JobMemoriesPanel.test.ts` (extend)

**Interfaces:**
- Consumes: `syncTmBase`, `EnsureBase` already on server
- Produces: after `createJobTmAttachment`, caller runs `await syncTmBase(tmBaseId, { pushOnly: true })` (owner path, no jobId). On shared list load / editor `refreshJobTmLayers`, for each attachment with `canRead`: `upsertSharedTmBase` + `syncTmBase(id, { jobId })`

- [ ] **Step 1: Types**

```ts
// JobTmAttachment
label?: string
color?: string
ownerId?: string
```

- [ ] **Step 2: createJobTmAttachment promote**

```ts
export async function createJobTmAttachment(jobId: string, input: ...) {
  const row = await apiFetch(...)
  await syncTmBase(input.tmBaseId, { pushOnly: true })
  return row
}
```

Surface errors to UI (existing `error` emit).

- [ ] **Step 3: JobMemoriesPanel + EditorPage**

After `listJobTmAttachmentsApi` succeeds, for each att with `canRead`:

```ts
await upsertSharedTmBase({ id: att.tmBaseId, label: att.label ?? att.tmBaseId, color: att.color ?? '#5b9fd4' })
await syncTmBase(att.tmBaseId, { jobId: props.jobId })
```

In `EditorPage.refreshJobTmLayers` / after load when `jobContext`, same pull for readable shared ids, then `reloadPersonalTmUnits()`.

- [ ] **Step 4: Member write path**

Ensure `markTmDirty` + `syncTm` / scheduled push uses `jobId` when pushing a base that is **not** in owned catalog but present in current job attachments with Write — pass jobId into dirty bucket key and `pushTmBaseSync`.

Simplest approach: `syncTm` accepts optional `jobContextId`; EditorPage calls `scheduleTmPush` / `syncTm({ pushOnly: true, jobId: jobQueryId })` when in job context. When pushing dirty for `baseId`, if owned → no jobId; else require `jobId` from opts.

- [ ] **Step 5: Tests + manual checklist**

- Mock create attachment → expects sync push called
- Panel refresh → pull with jobId

Run: `npm test -- --pool=threads tests/jobs/tmAttachmentsApi.test.ts tests/components/JobMemoriesPanel.test.ts`

Manual: two browsers, owner attach Personal with Write, member editor `?job=` sees/writes unit.

- [ ] **Step 6: Commit**

```bash
git add src/jobs/tmAttachmentsApi.ts src/components/JobMemoriesPanel.vue src/pages/EditorPage.vue src/types/job.ts src/storage/tmBasesIdb.ts tests/
git commit -m "feat: promote TM on job attach and sync shared bases for members"
```

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| `tm_bases` + `base_id` migration | 1 |
| Owner catalog API | 2 |
| Per-base sync + ACL + jobId disambiguation | 2 |
| Promote on attach (server EnsureBase) | 2 |
| Legacy `/api/tm/sync` keep | 2 |
| Client per-base cursors/dirty | 3 |
| Owned catalog sync | 3 |
| Client promote push after attach | 4 |
| Member pull on job/editor | 4 |
| Member write under owner | 2+4 |
| No project cross-user | — out of scope |
| Tests ACL / promote | 2, 4 |
