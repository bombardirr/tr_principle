# Job TM Attachments Part 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship server-backed `job_tm_attachments` CRUD (owner mutates, members read) and wire Job «Памяти» to that list plus a local-only member overlay — per [`2026-07-20-job-tm-attachments-part2-design.md`](../specs/2026-07-20-job-tm-attachments-part2-design.md).

**Architecture:** New Postgres table + Go store/handlers under `/api/jobs/{id}/tm-attachments`. Client loads shared list via API; `src/tm/jobAttachments.ts` becomes local overlay only. Editor match/write unchanged.

**Tech Stack:** Go (chi, pgx), goose migrations, Vue 3 + TypeScript, Vitest, vue-i18n, existing `apiFetch` / jobs HTTP integration test helpers.

## Global Constraints

- Owner-only mutations; any job member (incl. viewer) may GET.
- Schema/API: four flags `canRead|canWrite|canExport|canClone`; UI Part 2: only Read/Write.
- Soft `tm_base_id` TEXT (no server catalog FK).
- No editor match/write changes; no unit sync for foreign bases; no stub→server auto-migration.
- Keep `job_tm_units` / resource presets; do not revive product «ТМ работы».
- Non-owner mutation → 403 or same “job not found” pattern as other owner-only job routes (prefer **403** with `"forbidden"` for clarity on attachments; match existing owner checks that use 404 if codebase consistency wins — **use 404 `"job not found"`** like `PatchResourcePreset`).
- Duplicate attach → **409**.

## File map

| File | Responsibility |
|------|----------------|
| `api/migrations/017_job_tm_attachments.sql` | Table + indexes |
| `api/internal/jobs/attachments.go` | Types + Store CRUD |
| `api/internal/jobs/attachment_handlers.go` | HTTP handlers |
| `api/internal/jobs/attachments_integration_test.go` | HTTP ACL/CRUD tests |
| `api/internal/httpapi/router.go` | Register routes |
| `src/types/job.ts` | `JobTmAttachment` + input types |
| `src/jobs/tmAttachmentsApi.ts` | Client API wrappers |
| `src/tm/jobAttachments.ts` | Local overlay only (rename comments/key optional) |
| `src/components/JobMemoriesPanel.vue` | Shared (server) + local overlay UI |
| `src/i18n/locales/{ru,en}.ts` | New copy for two layers |
| `tests/jobs/tmAttachmentsApi.test.ts` | Client API (mocked fetch) |
| `tests/tm/jobAttachments.test.ts` | Overlay stub (update if renamed) |
| `tests/components/JobMemoriesPanel.test.ts` | Owner vs member UI |

---

### Task 1: Migration `job_tm_attachments`

**Files:**
- Create: `api/migrations/017_job_tm_attachments.sql`

**Interfaces:**
- Produces: table `job_tm_attachments` as in spec

- [ ] **Step 1: Add migration**

```sql
-- +goose Up
CREATE TABLE job_tm_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  tm_base_id TEXT NOT NULL,
  can_read BOOLEAN NOT NULL DEFAULT true,
  can_write BOOLEAN NOT NULL DEFAULT false,
  can_export BOOLEAN NOT NULL DEFAULT false,
  can_clone BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, tm_base_id)
);

CREATE INDEX job_tm_attachments_job_id ON job_tm_attachments (job_id);

-- +goose Down
DROP TABLE IF EXISTS job_tm_attachments;
```

- [ ] **Step 2: Commit**

```bash
git add api/migrations/017_job_tm_attachments.sql
git commit -m "db: add job_tm_attachments table"
```

---

### Task 2: Store CRUD

**Files:**
- Create: `api/internal/jobs/attachments.go`
- Modify: `api/internal/jobs/acl.go` (add `ErrAttachmentConflict`, `ErrAttachmentMissing` if not present)

**Interfaces:**
- Produces:
  - `type Attachment struct` with JSON camelCase tags matching spec
  - `ListAttachments(ctx, jobID, requesterID) ([]Attachment, error)` — requires membership
  - `CreateAttachment(ctx, jobID, ownerID, tmBaseID string, flags AttachmentFlags) (Attachment, error)` — requires owner
  - `UpdateAttachment(ctx, jobID, ownerID, attachmentID uuid.UUID, patch AttachmentPatch) (Attachment, error)`
  - `DeleteAttachment(ctx, jobID, ownerID, attachmentID uuid.UUID) error`
  - `type AttachmentFlags struct { CanRead, CanWrite, CanExport, CanClone bool }` with defaults applied by caller/handler
  - `type AttachmentPatch struct { CanRead, CanWrite, CanExport, CanClone *bool }`

- [ ] **Step 1: Implement store**

Create `api/internal/jobs/attachments.go`:

```go
package jobs

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

var (
	ErrAttachmentMissing  = errors.New("attachment not found")
	ErrAttachmentConflict = errors.New("attachment already exists")
	ErrInvalidAttachment  = errors.New("invalid attachment")
)

type Attachment struct {
	ID         uuid.UUID `json:"id"`
	JobID      uuid.UUID `json:"jobId"`
	TmBaseID   string    `json:"tmBaseId"`
	CanRead    bool      `json:"canRead"`
	CanWrite   bool      `json:"canWrite"`
	CanExport  bool      `json:"canExport"`
	CanClone   bool      `json:"canClone"`
	CreatedBy  uuid.UUID `json:"createdBy"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

type AttachmentFlags struct {
	CanRead   bool
	CanWrite  bool
	CanExport bool
	CanClone  bool
}

type AttachmentPatch struct {
	CanRead   *bool
	CanWrite  *bool
	CanExport *bool
	CanClone  *bool
}

func (s *Store) ListAttachments(ctx context.Context, jobID, requesterID uuid.UUID) ([]Attachment, error) {
	if _, err := s.RoleOf(ctx, jobID, requesterID); err != nil {
		return nil, err
	}
	rows, err := s.pool.Query(ctx, `
		SELECT id, job_id, tm_base_id, can_read, can_write, can_export, can_clone,
		       created_by, created_at, updated_at
		FROM job_tm_attachments
		WHERE job_id = $1
		ORDER BY created_at ASC, id ASC
	`, jobID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]Attachment, 0)
	for rows.Next() {
		var a Attachment
		if err := rows.Scan(
			&a.ID, &a.JobID, &a.TmBaseID, &a.CanRead, &a.CanWrite, &a.CanExport, &a.CanClone,
			&a.CreatedBy, &a.CreatedAt, &a.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (s *Store) CreateAttachment(
	ctx context.Context, jobID, ownerID uuid.UUID, tmBaseID string, flags AttachmentFlags,
) (Attachment, error) {
	owner, err := s.IsOwner(ctx, jobID, ownerID)
	if err != nil {
		return Attachment{}, err
	}
	if !owner {
		return Attachment{}, ErrNotMember // handlers map non-owner separately; prefer explicit check
	}
	tmBaseID = strings.TrimSpace(tmBaseID)
	if tmBaseID == "" {
		return Attachment{}, ErrInvalidAttachment
	}
	var a Attachment
	err = s.pool.QueryRow(ctx, `
		INSERT INTO job_tm_attachments (
			job_id, tm_base_id, can_read, can_write, can_export, can_clone, created_by
		) VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id, job_id, tm_base_id, can_read, can_write, can_export, can_clone,
		          created_by, created_at, updated_at
	`, jobID, tmBaseID, flags.CanRead, flags.CanWrite, flags.CanExport, flags.CanClone, ownerID,
	).Scan(
		&a.ID, &a.JobID, &a.TmBaseID, &a.CanRead, &a.CanWrite, &a.CanExport, &a.CanClone,
		&a.CreatedBy, &a.CreatedAt, &a.UpdatedAt,
	)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return Attachment{}, ErrAttachmentConflict
		}
		return Attachment{}, err
	}
	return a, nil
}

func (s *Store) UpdateAttachment(
	ctx context.Context, jobID, ownerID, attachmentID uuid.UUID, patch AttachmentPatch,
) (Attachment, error) {
	owner, err := s.IsOwner(ctx, jobID, ownerID)
	if err != nil {
		return Attachment{}, err
	}
	if !owner {
		return Attachment{}, ErrNotMember
	}
	var a Attachment
	err = s.pool.QueryRow(ctx, `
		UPDATE job_tm_attachments SET
			can_read = COALESCE($4, can_read),
			can_write = COALESCE($5, can_write),
			can_export = COALESCE($6, can_export),
			can_clone = COALESCE($7, can_clone),
			updated_at = now()
		WHERE id = $1 AND job_id = $2
		RETURNING id, job_id, tm_base_id, can_read, can_write, can_export, can_clone,
		          created_by, created_at, updated_at
	`, attachmentID, jobID, ownerID, patch.CanRead, patch.CanWrite, patch.CanExport, patch.CanClone,
	).Scan(
		&a.ID, &a.JobID, &a.TmBaseID, &a.CanRead, &a.CanWrite, &a.CanExport, &a.CanClone,
		&a.CreatedBy, &a.CreatedAt, &a.UpdatedAt,
	)
	// Note: $3 unused — fix SQL to use only $1,$2 and $3..$6 for flags:
	// WHERE id=$1 AND job_id=$2; COALESCE($3..$6)
	if errors.Is(err, pgx.ErrNoRows) {
		return Attachment{}, ErrAttachmentMissing
	}
	return a, err
}

func (s *Store) DeleteAttachment(ctx context.Context, jobID, ownerID, attachmentID uuid.UUID) error {
	owner, err := s.IsOwner(ctx, jobID, ownerID)
	if err != nil {
		return err
	}
	if !owner {
		return ErrNotMember
	}
	tag, err := s.pool.Exec(ctx, `
		DELETE FROM job_tm_attachments WHERE id = $1 AND job_id = $2
	`, attachmentID, jobID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrAttachmentMissing
	}
	return nil
}
```

**Important:** When implementing, fix `UpdateAttachment` SQL placeholders so they are consistent (`$1` id, `$2` job_id, `$3`–`$6` flags). Do not leave the `$3`/`ownerID` mismatch from the sketch.

For non-owner, handlers will call `IsOwner` first and return 404 — store may return `ErrNotMember` or handlers check owner before store. Prefer **handler-level owner check** (like `PatchResourcePreset`) and store methods that assume caller already authorized owner for mutations; still verify membership on list via `RoleOf`.

Simplified mutation contract (use this in real code):

- Handlers: `IsOwner` → if false → 404 `"job not found"`
- Store create/update/delete: only check job exists / row exists; still OK to double-check owner inside store.

- [ ] **Step 2: Commit**

```bash
git add api/internal/jobs/attachments.go
git commit -m "feat: job TM attachment store CRUD"
```

---

### Task 3: HTTP handlers + routes + integration test

**Files:**
- Create: `api/internal/jobs/attachment_handlers.go`
- Create: `api/internal/jobs/attachments_integration_test.go`
- Modify: `api/internal/httpapi/router.go`
- Modify: `api/internal/httpapi/router_test.go` only if route table assertions exist

**Interfaces:**
- Consumes: store methods from Task 2
- Produces: routes
  - `GET/POST /api/jobs/{id}/tm-attachments`
  - `PATCH/DELETE /api/jobs/{id}/tm-attachments/{attachmentId}`

- [ ] **Step 1: Write failing integration test**

Create `api/internal/jobs/attachments_integration_test.go` mirroring `tm_integration_test.go` helpers (`registerHTTPUser`, `requestJSON`, `requestRaw` — copy from same package `_test` helpers in that file or extract if already shared).

```go
func TestHTTPJobTMAttachmentsCRUDAndACL(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		t.Skip("DATABASE_URL not set")
	}
	// setup pool, migrate, router, owner/member/viewer, create job, accept invites
	// …same bootstrap as TestHTTPJobTMSyncACLAndAttribution…

	base := srv.URL + "/api/jobs/" + jobID.String() + "/tm-attachments"

	// member GET empty
	list := requestJSON(t, http.MethodGet, base, memberToken, nil, http.StatusOK)
	if len(list["attachments"].([]any)) != 0 {
		t.Fatalf("want empty list, got %v", list)
	}

	// member cannot POST
	requestRaw(t, http.MethodPost, base, memberToken, map[string]any{
		"tmBaseId": "personal-tm",
	}, http.StatusNotFound)

	// owner POST
	created := requestJSON(t, http.MethodPost, base, ownerToken, map[string]any{
		"tmBaseId": "personal-tm",
		"canRead":  true,
		"canWrite": true,
	}, http.StatusCreated)
	if created["tmBaseId"] != "personal-tm" || created["canExport"] != false {
		t.Fatalf("created = %v", created)
	}
	attID := created["id"].(string)

	// duplicate → 409
	requestRaw(t, http.MethodPost, base, ownerToken, map[string]any{
		"tmBaseId": "personal-tm",
	}, http.StatusConflict)

	// member sees list
	list = requestJSON(t, http.MethodGet, base, memberToken, nil, http.StatusOK)
	if len(list["attachments"].([]any)) != 1 {
		t.Fatalf("list = %v", list)
	}

	// owner PATCH write off
	patched := requestJSON(t, http.MethodPatch, base+"/"+attID, ownerToken, map[string]any{
		"canWrite": false,
	}, http.StatusOK)
	if patched["canWrite"] != false || patched["canRead"] != true {
		t.Fatalf("patched = %v", patched)
	}

	// member cannot DELETE
	requestRaw(t, http.MethodDelete, base+"/"+attID, memberToken, nil, http.StatusNotFound)

	// owner DELETE
	requestRaw(t, http.MethodDelete, base+"/"+attID, ownerToken, nil, http.StatusNoContent)
	list = requestJSON(t, http.MethodGet, base, ownerToken, nil, http.StatusOK)
	if len(list["attachments"].([]any)) != 0 {
		t.Fatalf("after delete = %v", list)
	}
}
```

Copy bootstrap helpers from `tm_integration_test.go` (same package `jobs_test`). If helpers are unexported in that file, they are already available in `jobs_test`.

- [ ] **Step 2: Run test — expect fail (404 routes)**

```bash
cd api && go test ./internal/jobs/ -run TestHTTPJobTMAttachmentsCRUDAndACL -count=1
```

Expected: FAIL (route not found or skip if no `DATABASE_URL` — then implement and re-run with DB).

- [ ] **Step 3: Implement handlers**

`attachment_handlers.go`:

```go
package jobs

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type attachmentCreateRequest struct {
	TmBaseID  string `json:"tmBaseId"`
	CanRead   *bool  `json:"canRead"`
	CanWrite  *bool  `json:"canWrite"`
	CanExport *bool  `json:"canExport"`
	CanClone  *bool  `json:"canClone"`
}

type attachmentPatchRequest struct {
	CanRead   *bool `json:"canRead"`
	CanWrite  *bool `json:"canWrite"`
	CanExport *bool `json:"canExport"`
	CanClone  *bool `json:"canClone"`
}

func (h *Handler) ListTMAttachments(w http.ResponseWriter, r *http.Request) {
	user, jobID, ok := requestJob(w, r)
	if !ok {
		return
	}
	items, err := h.Store.ListAttachments(r.Context(), jobID, user.ID)
	switch {
	case errors.Is(err, ErrNotMember):
		writeError(w, http.StatusNotFound, "job not found")
	case err != nil:
		writeError(w, http.StatusInternalServerError, "server error")
	default:
		writeJSON(w, http.StatusOK, map[string]any{"attachments": items})
	}
}

func (h *Handler) CreateTMAttachment(w http.ResponseWriter, r *http.Request) {
	user, jobID, ok := requestJob(w, r)
	if !ok {
		return
	}
	if !requireJobOwner(w, r, h, jobID, user.ID) {
		return
	}
	var body attachmentCreateRequest
	if !decodeJSON(w, r, &body) {
		return
	}
	flags := AttachmentFlags{
		CanRead:   true,
		CanWrite:  false,
		CanExport: false,
		CanClone:  false,
	}
	if body.CanRead != nil {
		flags.CanRead = *body.CanRead
	}
	if body.CanWrite != nil {
		flags.CanWrite = *body.CanWrite
	}
	if body.CanExport != nil {
		flags.CanExport = *body.CanExport
	}
	if body.CanClone != nil {
		flags.CanClone = *body.CanClone
	}
	item, err := h.Store.CreateAttachment(r.Context(), jobID, user.ID, body.TmBaseID, flags)
	switch {
	case errors.Is(err, ErrInvalidAttachment):
		writeError(w, http.StatusBadRequest, err.Error())
	case errors.Is(err, ErrAttachmentConflict):
		writeError(w, http.StatusConflict, "attachment already exists")
	case err != nil:
		writeError(w, http.StatusInternalServerError, "server error")
	default:
		writeJSON(w, http.StatusCreated, item)
	}
}

func (h *Handler) PatchTMAttachment(w http.ResponseWriter, r *http.Request) {
	user, jobID, ok := requestJob(w, r)
	if !ok {
		return
	}
	if !requireJobOwner(w, r, h, jobID, user.ID) {
		return
	}
	attID, err := uuid.Parse(chi.URLParam(r, "attachmentId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid attachment id")
		return
	}
	var body attachmentPatchRequest
	if !decodeJSON(w, r, &body) {
		return
	}
	item, err := h.Store.UpdateAttachment(r.Context(), jobID, user.ID, attID, AttachmentPatch{
		CanRead: body.CanRead, CanWrite: body.CanWrite, CanExport: body.CanExport, CanClone: body.CanClone,
	})
	switch {
	case errors.Is(err, ErrAttachmentMissing):
		writeError(w, http.StatusNotFound, "attachment not found")
	case err != nil:
		writeError(w, http.StatusInternalServerError, "server error")
	default:
		writeJSON(w, http.StatusOK, item)
	}
}

func (h *Handler) DeleteTMAttachment(w http.ResponseWriter, r *http.Request) {
	user, jobID, ok := requestJob(w, r)
	if !ok {
		return
	}
	if !requireJobOwner(w, r, h, jobID, user.ID) {
		return
	}
	attID, err := uuid.Parse(chi.URLParam(r, "attachmentId"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid attachment id")
		return
	}
	err = h.Store.DeleteAttachment(r.Context(), jobID, user.ID, attID)
	switch {
	case errors.Is(err, ErrAttachmentMissing):
		writeError(w, http.StatusNotFound, "attachment not found")
	case err != nil:
		writeError(w, http.StatusInternalServerError, "server error")
	default:
		w.WriteHeader(http.StatusNoContent)
	}
}

func requireJobOwner(w http.ResponseWriter, r *http.Request, h *Handler, jobID, userID uuid.UUID) bool {
	owner, err := h.Store.IsOwner(r.Context(), jobID, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "server error")
		return false
	}
	if !owner {
		writeError(w, http.StatusNotFound, "job not found")
		return false
	}
	return true
}
```

Remove unused `encoding/json` import if not needed.

Wire in `router.go` inside the authenticated jobs group:

```go
r.Get("/api/jobs/{id}/tm-attachments", jobsHandler.ListTMAttachments)
r.Post("/api/jobs/{id}/tm-attachments", jobsHandler.CreateTMAttachment)
r.Patch("/api/jobs/{id}/tm-attachments/{attachmentId}", jobsHandler.PatchTMAttachment)
r.Delete("/api/jobs/{id}/tm-attachments/{attachmentId}", jobsHandler.DeleteTMAttachment)
```

- [ ] **Step 4: Run integration test**

```bash
cd api && go test ./internal/jobs/ -run TestHTTPJobTMAttachmentsCRUDAndACL -count=1
```

Expected: PASS (with `DATABASE_URL` set).

- [ ] **Step 5: Commit**

```bash
git add api/internal/jobs/attachment_handlers.go api/internal/jobs/attachments_integration_test.go api/internal/httpapi/router.go
git commit -m "feat: job TM attachments HTTP API"
```

---

### Task 4: Client API + types

**Files:**
- Modify: `src/types/job.ts`
- Create: `src/jobs/tmAttachmentsApi.ts`
- Create: `tests/jobs/tmAttachmentsApi.test.ts`

**Interfaces:**
- Produces:
  - `JobTmAttachment` type
  - `listJobTmAttachmentsApi(jobId): Promise<JobTmAttachment[]>`
  - `createJobTmAttachment(jobId, input): Promise<JobTmAttachment>`
  - `patchJobTmAttachment(jobId, attachmentId, patch): Promise<JobTmAttachment>`
  - `deleteJobTmAttachment(jobId, attachmentId): Promise<void>`

- [ ] **Step 1: Failing test**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createJobTmAttachment,
  deleteJobTmAttachment,
  listJobTmAttachmentsApi,
  patchJobTmAttachment,
} from '../../src/jobs/tmAttachmentsApi'

const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

beforeEach(() => {
  fetchMock.mockReset()
  localStorage.setItem('appzac-auth-token', 'tok')
})

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('tmAttachmentsApi', () => {
  it('lists attachments', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        attachments: [
          {
            id: 'a1',
            jobId: 'j1',
            tmBaseId: 'personal-tm',
            canRead: true,
            canWrite: false,
            canExport: false,
            canClone: false,
            createdBy: 'u1',
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
      }),
    )
    const items = await listJobTmAttachmentsApi('j1')
    expect(items).toHaveLength(1)
    expect(items[0]!.tmBaseId).toBe('personal-tm')
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/jobs/j1/tm-attachments')
  })

  it('creates attachment', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, {
        id: 'a1',
        jobId: 'j1',
        tmBaseId: 'personal-tm',
        canRead: true,
        canWrite: true,
        canExport: false,
        canClone: false,
        createdBy: 'u1',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      }),
    )
    const item = await createJobTmAttachment('j1', { tmBaseId: 'personal-tm', canWrite: true })
    expect(item.id).toBe('a1')
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'POST' })
  })

  it('patches and deletes', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          id: 'a1',
          jobId: 'j1',
          tmBaseId: 'personal-tm',
          canRead: true,
          canWrite: false,
          canExport: false,
          canClone: false,
          createdBy: 'u1',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    await patchJobTmAttachment('j1', 'a1', { canWrite: false })
    await deleteJobTmAttachment('j1', 'a1')
    expect(fetchMock.mock.calls[1]![1]).toMatchObject({ method: 'DELETE' })
  })
})
```

- [ ] **Step 2: Run — expect fail**

```bash
npx vitest run tests/jobs/tmAttachmentsApi.test.ts
```

Expected: FAIL module not found.

- [ ] **Step 3: Types + API**

Add to `src/types/job.ts`:

```ts
export type JobTmAttachment = {
  id: string
  jobId: string
  tmBaseId: string
  canRead: boolean
  canWrite: boolean
  canExport: boolean
  canClone: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type CreateJobTmAttachmentInput = {
  tmBaseId: string
  canRead?: boolean
  canWrite?: boolean
  canExport?: boolean
  canClone?: boolean
}

export type PatchJobTmAttachmentInput = {
  canRead?: boolean
  canWrite?: boolean
  canExport?: boolean
  canClone?: boolean
}
```

Create `src/jobs/tmAttachmentsApi.ts`:

```ts
import { apiFetch } from '@/auth/api'
import type {
  CreateJobTmAttachmentInput,
  JobTmAttachment,
  PatchJobTmAttachmentInput,
} from '@/types/job'

export async function listJobTmAttachmentsApi(jobId: string) {
  const res = await apiFetch<{ attachments: JobTmAttachment[] }>(
    `/api/jobs/${jobId}/tm-attachments`,
  )
  return res.attachments ?? []
}

export async function createJobTmAttachment(jobId: string, input: CreateJobTmAttachmentInput) {
  return apiFetch<JobTmAttachment>(`/api/jobs/${jobId}/tm-attachments`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function patchJobTmAttachment(
  jobId: string,
  attachmentId: string,
  input: PatchJobTmAttachmentInput,
) {
  return apiFetch<JobTmAttachment>(`/api/jobs/${jobId}/tm-attachments/${attachmentId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export async function deleteJobTmAttachment(jobId: string, attachmentId: string) {
  await apiFetch<void>(`/api/jobs/${jobId}/tm-attachments/${attachmentId}`, {
    method: 'DELETE',
  })
}
```

Note: `apiFetch` on 204 may need empty body handling — confirm existing behavior; if it throws on empty JSON, mirror other DELETE helpers in `src/jobs/api.ts` (`deleteJob`).

- [ ] **Step 4: Run tests — PASS**

```bash
npx vitest run tests/jobs/tmAttachmentsApi.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/types/job.ts src/jobs/tmAttachmentsApi.ts tests/jobs/tmAttachmentsApi.test.ts
git commit -m "feat: client job TM attachments API"
```

---

### Task 5: Local overlay module (narrow stub)

**Files:**
- Modify: `src/tm/jobAttachments.ts` — document as **local overlay**; keep key `tr_principle.job_tm_attachments.v1` (or rename to `…job_tm_local_overlay.v1` and migrate-read both keys once)
- Modify: `tests/tm/jobAttachments.test.ts` if needed
- Modify: `src/components/TmCollectionDialog.vue` — keep reading overlay key for “attached” marks when picking for job local overlay; shared server ids come from panel props

**Interfaces:**
- Keep exports: `listJobTmAttachments`, `attachJobTm`, `detachJobTm`, `updateJobTmAttachment`, `detachJobTmEverywhere` (still used by `tmCollection.deleteOwn`)
- Optionally alias: `listJobTmLocalOverlay` = same function (YAGNI: keep names, add file comment)

- [ ] **Step 1: Add file header comment** in `jobAttachments.ts`:

```ts
/**
 * Local-only job TM overlay (per browser).
 * Shared job attachments live on the server — see src/jobs/tmAttachmentsApi.ts.
 */
```

- [ ] **Step 2: Run existing stub tests**

```bash
npx vitest run tests/tm/jobAttachments.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/tm/jobAttachments.ts
git commit -m "docs: clarify job TM local overlay vs server attachments"
```

---

### Task 6: JobMemoriesPanel — two layers + owner ACL

**Files:**
- Modify: `src/components/JobMemoriesPanel.vue`
- Modify: `src/i18n/locales/ru.ts`, `src/i18n/locales/en.ts`
- Modify: `tests/components/JobMemoriesPanel.test.ts`

**Interfaces:**
- Consumes: `listJobTmAttachmentsApi`, create/patch/delete; local overlay helpers; `props.isOwner`
- UI:
  - Section **Базы работы** (`jobs.memoriesJobBasesTitle`): server list
  - Owner: `+` / ЧЗ / `−` against server API (`tmBaseId` = collection id)
  - Non-owner: read-only checkboxes (disabled) or text-only flags; no add/detach
  - Section **Мои доп.** (`jobs.memoriesLocalOverlayTitle`): local overlay; any member can mutate locally
  - Personal row unchanged

- [ ] **Step 1: Add i18n keys**

`ru.ts` / `en.ts` under `jobs`:

| Key | RU | EN |
|-----|----|----|
| `memoriesJobBasesTitle` | Базы работы | Job bases |
| `memoriesJobBasesEmpty` | Owner ещё не прикрепил общие базы. | No shared bases attached yet. |
| `memoriesLocalOverlayTitle` | Мои доп. | My extras |
| `memoriesLocalOverlayEmpty` | Нет локальных доп. баз. | No local extra bases. |
| `memoriesLocalOverlayHint` | Только у вас на этом устройстве | Only on this device for you |

Keep `memoriesAttach` / `memoriesDetach` for both sections (or add `memoriesAttachLocal` if labels must differ — prefer reuse).

- [ ] **Step 2: Update component tests (fail first)**

Rewrite `tests/components/JobMemoriesPanel.test.ts`:

```ts
import { createApp, h, nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/jobs/tmAttachmentsApi', () => ({
  listJobTmAttachmentsApi: vi.fn(async () => []),
  createJobTmAttachment: vi.fn(async (_jobId: string, input: { tmBaseId: string }) => ({
    id: 'att-1',
    jobId: 'job-1',
    tmBaseId: input.tmBaseId,
    canRead: true,
    canWrite: true,
    canExport: false,
    canClone: false,
    createdBy: 'u1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  })),
  patchJobTmAttachment: vi.fn(),
  deleteJobTmAttachment: vi.fn(async () => undefined),
}))

import JobMemoriesPanel from '../../src/components/JobMemoriesPanel.vue'
import { listJobTmAttachmentsApi, createJobTmAttachment } from '../../src/jobs/tmAttachmentsApi'

// …messages include new keys…

describe('JobMemoriesPanel', () => {
  beforeEach(() => {
    vi.mocked(listJobTmAttachmentsApi).mockResolvedValue([])
    localStorage.clear()
  })

  it('owner sees add for job bases; member does not', async () => {
    const ownerHost = mountPanel({ jobId: 'job-1', isOwner: true, myRole: 'owner' })
    await nextTick()
    await nextTick()
    expect(ownerHost.querySelector('[data-testid="job-tm-add"]')).not.toBeNull()

    const memberHost = mountPanel({ jobId: 'job-1', isOwner: false, myRole: 'translator' })
    await nextTick()
    await nextTick()
    expect(memberHost.querySelector('[data-testid="job-tm-add"]')).toBeNull()
  })

  it('owner attach calls createJobTmAttachment', async () => {
    const host = mountPanel({ jobId: 'job-1', isOwner: true, myRole: 'owner' })
    await nextTick()
    await nextTick()
    host.querySelector<HTMLButtonElement>('[data-testid="job-tm-add"]')!.click()
    await nextTick()
    const personalCard = [...host.querySelectorAll<HTMLElement>('[role="button"]')].find(c =>
      c.textContent?.includes('Personal TM'),
    )
    personalCard!.click()
    await nextTick()
    await nextTick()
    expect(createJobTmAttachment).toHaveBeenCalledWith(
      'job-1',
      expect.objectContaining({ tmBaseId: 'personal-tm' }),
    )
  })
})
```

- [ ] **Step 3: Run — expect fail**

```bash
npx vitest run tests/components/JobMemoriesPanel.test.ts
```

- [ ] **Step 4: Implement panel**

Skeleton behavior:

```ts
const shared = ref<JobTmAttachment[]>([])
const localOverlay = ref(listJobTmAttachments(props.jobId))
const loadError = ref<string | null>(null)

async function refreshShared() {
  shared.value = await listJobTmAttachmentsApi(props.jobId)
}

onMounted(() => { void refreshShared() })
watch(() => props.jobId, () => {
  localOverlay.value = listJobTmAttachments(props.jobId)
  void refreshShared()
})

async function attachShared(tmBaseId: ProjectTmAttachmentId) {
  if (!props.isOwner) return
  const created = await createJobTmAttachment(props.jobId, {
    tmBaseId,
    canRead: true,
    canWrite: true,
  })
  shared.value = [...shared.value, created]
  closeCollection()
}

async function detachShared(attachmentId: string) {
  if (!props.isOwner) return
  await deleteJobTmAttachment(props.jobId, attachmentId)
  shared.value = shared.value.filter(x => x.id !== attachmentId)
}

async function toggleShared(attachmentId: string, permission: 'canRead' | 'canWrite', value: boolean) {
  if (!props.isOwner) return
  const updated = await patchJobTmAttachment(props.jobId, attachmentId, { [permission]: value })
  shared.value = shared.value.map(x => (x.id === updated.id ? updated : x))
}

function attachLocal(id: ProjectTmAttachmentId) {
  localOverlay.value = attachJobTm(props.jobId, id)
  closeLocalPick()
}
// detachLocal / toggleLocal via existing stub helpers
```

Template: two blocks; `data-testid="job-tm-add"` only on shared section when `isOwner`; `data-testid="job-tm-local-add"` for overlay. Map shared rows by `attachment.id` (UUID) and display label via `tmBaseId`. Disable shared permission inputs when `!isOwner`.

Optimistic UI optional; on API error show inline `loadError` / toast if project has one — minimal: `console` + revert by `refreshShared()`.

- [ ] **Step 5: Run component tests — PASS**

```bash
npx vitest run tests/components/JobMemoriesPanel.test.ts tests/tm/jobAttachments.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/components/JobMemoriesPanel.vue src/i18n/locales/ru.ts src/i18n/locales/en.ts tests/components/JobMemoriesPanel.test.ts
git commit -m "feat: wire Job memories to server TM attachments"
```

---

### Task 7: Verification + plan checkbox pass

**Files:** none required (docs only if spec success criteria need a note)

- [ ] **Step 1: Frontend tests**

```bash
npx vitest run tests/jobs/tmAttachmentsApi.test.ts tests/tm/jobAttachments.test.ts tests/components/JobMemoriesPanel.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Go tests (with DB)**

```bash
cd api && go test ./internal/jobs/ -run 'TestHTTPJobTMAttachments|TestHTTPJobTMSync' -count=1
```

Expected: PASS when `DATABASE_URL` is set; otherwise document skip in PR notes.

- [ ] **Step 3: Manual smoke (optional)**

1. Owner opens job → Памяти → attach personal-tm to **Базы работы** → refresh → still there.  
2. Member sees same list read-only; can add **Мои доп.** locally.  
3. Editor still matches personal TM as before.

- [ ] **Step 4: Final commit if any leftover**

```bash
git status
# commit only if dirty
```

---

## Spec coverage (self-review)

| Spec item | Task |
|-----------|------|
| Migration table + 4 flags + unique | 1 |
| CRUD API owner/member ACL + 409 | 2–3 |
| Client API | 4 |
| Local overlay not on server | 5–6 |
| UI Ч/З only; Export/Clone defaults | 3–6 |
| No editor match changes | (explicit non-goal; Task 7 smoke) |
| No stub auto-migration | (explicit; Task 6 does not migrate) |
| Integration + client tests | 3, 4, 6, 7 |

## Placeholder / consistency notes

- Store `UpdateAttachment` SQL in Task 2 sketch must use coherent `$n` placeholders — implementer fixes before commit.
- Attachment row `id` is UUID; UI detach/patch uses that id, display uses `tmBaseId`.
- `ProjectTmAttachmentId` today is `'personal-tm'`; `tmBaseId` is `string` on server for future named bases.
