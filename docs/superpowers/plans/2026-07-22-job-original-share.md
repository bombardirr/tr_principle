# Job Original DOCX Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Job owner uploads the original DOCX to the server; any member can download it from the job hub; owner can replace/revoke — per [`2026-07-22-job-original-share-design.md`](../specs/2026-07-22-job-original-share-design.md).

**Architecture:** Store bytes on disk under `BACKUP_DIR/job-originals/{jobId}.docx` with metadata in `job_originals`. SHA-256 of body must match `jobs.source_hash`. Job JSON gains `hasOriginal` / `originalFilename`. Thin client helpers mirror project backup upload/download; UI only in `JobHubInline`.

**Tech Stack:** Go (chi, pgx), Postgres migrations, Vue 3, TypeScript, vue-i18n, existing `fingerprintDocx` / `apiBlob` / `downloadBlob`.

## Global Constraints

- Explicit owner share only (not at job create)
- Any member including viewer may download
- Owner replace + revoke; DELETE original → **204** if already gone
- Hash must match `jobs.source_hash` (client + server); empty `source_hash` → PUT 400
- Size limit **50 MiB** (`MaxOriginalBytes = 50 << 20`)
- UI: `JobHubInline` only
- Pro / quotas: out of scope
- Disk path: `{BACKUP_DIR}/job-originals/{job_id}.docx`

## File map

| File | Role |
|------|------|
| `api/migrations/019_job_originals.sql` | Table `job_originals` |
| `api/internal/jobs/types.go` | `HasOriginal`, `OriginalFilename` on `Job`; `OriginalMeta` |
| `api/internal/jobs/operations.go` | Extend all `scanJob` SELECTs; original store CRUD |
| `api/internal/jobs/original.go` | Store helpers for meta + path (optional split from operations) |
| `api/internal/jobs/original_handlers.go` | `PutOriginal`, `GetOriginal`, `DeleteOriginal` |
| `api/internal/jobs/handlers.go` | `Handler.BackupDir`; clean file on job `Delete` |
| `api/internal/httpapi/router.go` | Register PUT/GET/HEAD/DELETE `/api/jobs/{id}/original` |
| `api/cmd/server/main.go` | Pass `cfg.BackupDir` into `jobs.Handler` |
| `api/internal/jobs/original_integration_test.go` | HTTP ACL + hash + roundtrip |
| `api/internal/httpapi/router_test.go` | Route registration smoke for `/original` |
| `src/types/job.ts` | `hasOriginal?`, `originalFilename?` |
| `src/jobs/originalApi.ts` | put / get / delete helpers |
| `src/components/JobHubInline.vue` | Share / Download / Replace / Remove |
| `src/i18n/locales/{en,ru}.ts` | Copy + errors |

---

### Task 1: Migration + Job JSON fields + store meta

**Files:**
- Create: `api/migrations/019_job_originals.sql`
- Create: `api/internal/jobs/original.go` (store methods)
- Modify: `api/internal/jobs/types.go`
- Modify: `api/internal/jobs/operations.go` (every `scanJob` SELECT/RETURNING)

**Interfaces:**
- Produces:
  - `Job.HasOriginal bool` `json:"hasOriginal"`
  - `Job.OriginalFilename string` `json:"originalFilename,omitempty"` (omit empty)
  - `type OriginalMeta struct { Filename string; ContentHash string; SizeBytes int64; StoragePath string; UploadedBy uuid.UUID; UploadedAt time.Time }`
  - `(s *Store) UpsertOriginalMeta(ctx, jobID, meta OriginalMeta) error`
  - `(s *Store) GetOriginalMeta(ctx, jobID) (OriginalMeta, error)` — `pgx.ErrNoRows` if none
  - `(s *Store) DeleteOriginalMeta(ctx, jobID) error` — no error if missing
  - `(s *Store) GetJobSourceHash(ctx, jobID) (hash string, err error)` — or read via existing GetJob for owner path

- [ ] **Step 1: Add migration** `api/migrations/019_job_originals.sql`

```sql
-- +migrate Up
CREATE TABLE IF NOT EXISTS job_originals (
  job_id UUID PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  storage_path TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- +migrate Down
DROP TABLE IF EXISTS job_originals;
```

(Match the migrate comment style used in neighboring migrations — if the repo uses only `Up` without goose headers, copy `018_tm_bases.sql` exactly.)

- [ ] **Step 2: Extend `Job` in `types.go`**

```go
HasOriginal       bool   `json:"hasOriginal"`
OriginalFilename  string `json:"originalFilename,omitempty"`
```

- [ ] **Step 3: Update `scanJob` + every job SELECT**

Append two columns to **every** query that feeds `scanJob`:

```sql
EXISTS(SELECT 1 FROM job_originals o WHERE o.job_id = <job_id_expr>) AS has_original,
COALESCE((SELECT o.filename FROM job_originals o WHERE o.job_id = <job_id_expr>), '') AS original_filename
```

Use `j.id` in List/Get joins; use `jobs.id` or `id` in `RETURNING` from `UPDATE`/`INSERT` as appropriate. Update `scanJob` to Scan into `HasOriginal` and `OriginalFilename`.

- [ ] **Step 4: Implement store in `original.go`**

```go
func (s *Store) UpsertOriginalMeta(ctx context.Context, jobID uuid.UUID, meta OriginalMeta) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO job_originals (job_id, filename, content_hash, size_bytes, storage_path, uploaded_by, uploaded_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (job_id) DO UPDATE SET
		  filename = EXCLUDED.filename,
		  content_hash = EXCLUDED.content_hash,
		  size_bytes = EXCLUDED.size_bytes,
		  storage_path = EXCLUDED.storage_path,
		  uploaded_by = EXCLUDED.uploaded_by,
		  uploaded_at = EXCLUDED.uploaded_at
	`, jobID, meta.Filename, meta.ContentHash, meta.SizeBytes, meta.StoragePath, meta.UploadedBy, meta.UploadedAt)
	return err
}
```

`GetOriginalMeta` / `DeleteOriginalMeta` as above.

- [ ] **Step 5: Commit**

```bash
git add api/migrations/019_job_originals.sql api/internal/jobs/types.go api/internal/jobs/operations.go api/internal/jobs/original.go
git commit -m "feat: add job_originals table and hasOriginal on job JSON"
```

---

### Task 2: HTTP handlers + routes + integration tests

**Files:**
- Create: `api/internal/jobs/original_handlers.go`
- Create: `api/internal/jobs/original_integration_test.go`
- Modify: `api/internal/jobs/handlers.go` (`BackupDir` field; file cleanup on `Delete`)
- Modify: `api/cmd/server/main.go`
- Modify: `api/internal/httpapi/router.go`
- Modify: `api/internal/httpapi/router_test.go`
- Modify: existing test servers that construct `&jobs.Handler{...}` — set `BackupDir: t.TempDir()` where original tests need it (at least the new integration test)

**Interfaces:**
- Consumes: store methods from Task 1; `RoleOf` / `IsOwner` / `IsArchived`; `BACKUP_DIR` via `h.BackupDir`
- Produces:
  - `PUT /api/jobs/{id}/original` → JSON `{ ok, sizeBytes, filename }` or errors
  - `GET|HEAD /api/jobs/{id}/original` → file stream
  - `DELETE /api/jobs/{id}/original` → 204

- [ ] **Step 1: Write failing integration test** `original_integration_test.go`

Pattern: same bootstrap as `handlers_integration_test.go`, but:

```go
backupDir := t.TempDir()
&jobs.Handler{Store: jobs.NewStore(pool), BackupDir: backupDir}
```

Helpers: create job with known `sourceHash` = hex SHA-256 of payload bytes.

Cases (one `TestJobOriginalShare` or subtests):

1. Owner PUT matching bytes → 200; GET job → `hasOriginal == true`
2. Owner PUT wrong hash → 400 (`original hash mismatch`)
3. Member (translator) GET → 200, body equals uploaded bytes
4. Viewer GET → 200 (create invite role viewer)
5. Non-member GET → 403
6. Non-owner PUT → 403
7. Owner DELETE → 204; GET → 404; job `hasOriginal == false`
8. Owner DELETE again → 204
9. Body > 50 MiB → 413 (optional: use `MaxBytesReader` with a slightly oversize reader if cheap; else skip and assert MaxBytesReader in handler code review)

Compute hash in test:

```go
sum := sha256.Sum256(payload)
hash := hex.EncodeToString(sum[:])
```

PUT with header `X-Filename: manual.docx` and `Content-Type: application/octet-stream`.

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd api && go test ./internal/jobs/ -run TestJobOriginal -count=1
```

Expected: FAIL (route 404 or handler missing). Requires `DATABASE_URL`.

- [ ] **Step 3: Implement handlers**

In `original_handlers.go`:

```go
const MaxOriginalBytes = 50 << 20 // 50 MiB

func (h *Handler) originalAbsPath(jobID uuid.UUID) (rel, abs string, err error) {
	// same escape checks as projects.backupPaths
	// abs = filepath.Join(h.BackupDir, "job-originals", jobID.String()+".docx")
}

func (h *Handler) PutOriginal(w http.ResponseWriter, r *http.Request) { /* ... */ }
func (h *Handler) GetOriginal(w http.ResponseWriter, r *http.Request) { /* ... */ }
func (h *Handler) DeleteOriginal(w http.ResponseWriter, r *http.Request) { /* ... */ }
```

**PutOriginal logic:**

1. Auth + `requestJob`
2. `IsOwner` — else 403
3. `IsArchived` — if archived → 400 `job archived`
4. `MaxBytesReader` + `io.ReadAll`
5. Empty → 400
6. Load job (`GetJob`) — if `SourceHash` empty → 400 `missing source hash`
7. `sha256` hex of body; if ≠ `job.SourceHash` → 400 `original hash mismatch`
8. Filename from `X-Filename` (basename only); else existing meta filename; else `job.SourceFilename`; else `original.docx`
9. Write `.tmp` then rename; `UpsertOriginalMeta`
10. JSON 200 `{ok, sizeBytes, filename}`

**GetOriginal:** `RoleOf` any member; `GetOriginalMeta`; open file; set `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document`; `Content-Disposition: attachment; filename="..."`; HEAD skips body (`http.ServeContent` or manual).

**DeleteOriginal:** owner only; delete file if exists; `DeleteOriginalMeta`; always **204**.

**Job Delete:** after successful `DeleteJob`, `os.Remove` the abs path (ignore not-exist).

Wire `BackupDir` on `Handler` in `main.go`:

```go
jobsHandler := &jobs.Handler{Store: jobs.NewStore(pool), TM: tmStore, BackupDir: cfg.BackupDir}
```

Router:

```go
r.Put("/api/jobs/{id}/original", jobsHandler.PutOriginal)
r.Get("/api/jobs/{id}/original", jobsHandler.GetOriginal)
r.Head("/api/jobs/{id}/original", jobsHandler.GetOriginal)
r.Delete("/api/jobs/{id}/original", jobsHandler.DeleteOriginal)
```

Add those three methods to `router_test.go` jobs auth smoke (expect 401 without auth, not 404).

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd api && go test ./internal/jobs/ -run TestJobOriginal -count=1
cd api && go test ./internal/httpapi/ -count=1
```

- [ ] **Step 5: Commit**

```bash
git add api/internal/jobs/original_handlers.go api/internal/jobs/original_integration_test.go api/internal/jobs/handlers.go api/cmd/server/main.go api/internal/httpapi/router.go api/internal/httpapi/router_test.go
git commit -m "feat: job original DOCX upload download and revoke API"
```

---

### Task 3: Client API + types

**Files:**
- Create: `src/jobs/originalApi.ts`
- Modify: `src/types/job.ts`
- Test: optional small unit test not required if helpers are thin; prefer smoke via hub later

**Interfaces:**
- Produces:
  - `putJobOriginal(jobId: string, blob: Blob, filename: string): Promise<{ ok: boolean; sizeBytes: number; filename: string }>`
  - `getJobOriginal(jobId: string): Promise<Blob>`
  - `deleteJobOriginal(jobId: string): Promise<void>`

- [ ] **Step 1: Extend `Job` type**

```ts
hasOriginal?: boolean
originalFilename?: string
```

- [ ] **Step 2: Implement `src/jobs/originalApi.ts`**

Mirror `src/projects/api.ts` put/get (raw `fetch` + Bearer), and use `apiFetch` for DELETE void:

```ts
import { apiFetch, getStoredToken, ApiError } from '@/auth/api'
import { apiBlob } from '@/auth/api' // if path works for binary GET

function apiBase() {
  return (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? ''
}

export async function putJobOriginal(jobId: string, blob: Blob, filename: string) {
  const headers = new Headers()
  const token = getStoredToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  headers.set('Content-Type', 'application/octet-stream')
  headers.set('X-Filename', filename)
  const res = await fetch(`${apiBase()}/api/jobs/${jobId}/original`, {
    method: 'PUT',
    headers,
    body: blob,
  })
  // parse error JSON like putProjectBackup
  return (await res.json()) as { ok: boolean; sizeBytes: number; filename: string }
}

export async function getJobOriginal(jobId: string): Promise<Blob> {
  return apiBlob(`/api/jobs/${jobId}/original`)
}

export async function deleteJobOriginal(jobId: string): Promise<void> {
  await apiFetch<void>(`/api/jobs/${jobId}/original`, { method: 'DELETE' })
}
```

Ensure `apiFetch` treats empty 204 body as success (already does via empty text).

- [ ] **Step 3: Commit**

```bash
git add src/types/job.ts src/jobs/originalApi.ts
git commit -m "feat: client helpers for job original share"
```

---

### Task 4: Job hub UI + i18n

**Files:**
- Modify: `src/components/JobHubInline.vue`
- Modify: `src/i18n/locales/en.ts`
- Modify: `src/i18n/locales/ru.ts`

**Interfaces:**
- Consumes: `putJobOriginal`, `getJobOriginal`, `deleteJobOriginal`, `fingerprintDocx`, `downloadBlob`
- Produces: hub buttons wired to job `hasOriginal`

- [ ] **Step 1: Add i18n keys** (en + ru)

Under `jobs`:

```ts
shareOriginal: 'Share original',
downloadOriginal: 'Download original',
replaceOriginal: 'Replace original',
removeOriginal: 'Remove original',
confirmRemoveOriginal: 'Remove the shared original from the server?',
originalHashMismatch: 'This file does not match the work’s original document.',
originalShareFailed: 'Could not share the original.',
originalDownloadFailed: 'Could not download the original.',
originalRemoveFailed: 'Could not remove the original.',
originalMissingSourceHash: 'This work has no source fingerprint; cannot share original.',
```

Russian equivalents in `ru.ts`.

- [ ] **Step 2: Wire UI in `JobHubInline.vue`**

In `hub-actions` (or a small row under header, still in hub — prefer next to archive/delete for owner, and a single download for members):

**Hidden file input** `accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"`.

**Owner, not archived:**

- `!job.hasOriginal` → button Share → click input
- `job.hasOriginal` → Download + Replace + Remove  
  - Remove: two-step confirm like archive (`pendingAction = 'remove-original'`) or `window.confirm` with `confirmRemoveOriginal` — prefer same pending-action pattern as archive for consistency.

**Any member when `job.hasOriginal`:** Download (owner already has Download).

**Handlers:**

```ts
async function onOriginalFile(file: File) {
  if (!job.value?.sourceHash) {
    error.value = t('jobs.originalMissingSourceHash')
    return
  }
  const buf = await file.arrayBuffer()
  const fp = await fingerprintDocx(file.name, buf)
  if (fp.hash !== job.value.sourceHash) {
    error.value = t('jobs.originalHashMismatch')
    return
  }
  busy.value = true
  try {
    const res = await putJobOriginal(jobId.value, new Blob([buf]), fp.filename)
    job.value = {
      ...job.value,
      hasOriginal: true,
      originalFilename: res.filename,
    }
  } catch (e) {
    error.value = /* map ApiError */ t('jobs.originalShareFailed')
  } finally {
    busy.value = false
  }
}

async function downloadOriginal() {
  const blob = await getJobOriginal(jobId.value)
  downloadBlob(blob, job.value?.originalFilename || job.value?.sourceFilename || 'original.docx')
}

async function removeOriginal() {
  await deleteJobOriginal(jobId.value)
  if (job.value) {
    job.value = { ...job.value, hasOriginal: false, originalFilename: undefined }
  }
}
```

Disable controls when `busy` or archived (owner mutations).

- [ ] **Step 3: Manual smoke** (dev server)

1. Create/open job with known DOCX fingerprint  
2. Owner Share matching file → Download works  
3. Wrong file → mismatch message, no upload  
4. Second account as viewer → Download works  
5. Owner Remove → Download gone  

- [ ] **Step 4: Commit**

```bash
git add src/components/JobHubInline.vue src/i18n/locales/en.ts src/i18n/locales/ru.ts
git commit -m "feat: job hub share and download original DOCX"
```

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| `job_originals` + disk path | 1–2 |
| PUT/GET/HEAD/DELETE API + ACL | 2 |
| Hash check client + server | 2, 4 |
| `hasOriginal` / `originalFilename` | 1, 3 |
| Replace / revoke 204 | 2, 4 |
| Job hub UI | 4 |
| 50 MiB | 2 |
| Job delete cleans file | 2 |
| Pro gate deferred | — (out of scope) |

## Self-review notes

- No TBD placeholders.
- Filename header fixed as `X-Filename` (basename sanitized on server).
- Archived: PUT/DELETE rejected; GET still allowed for members.
- All `scanJob` call sites must gain the two subquery columns or List/Get will break — Task 1 owns that sweep.
