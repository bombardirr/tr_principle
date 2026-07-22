# Job original DOCX — share / download

Date: 2026-07-22  
Status: Implemented (main)  
Related:

- [`2026-07-17-shared-work-jobs-design.md`](./2026-07-17-shared-work-jobs-design.md) — jobs store fingerprint only (`source_filename`, `source_hash`), not DOCX bytes
- Project backup handlers (`PUT/GET /api/projects/{id}/backup`) — filesystem pattern under `BACKUP_DIR`
- Plan: [`../plans/2026-07-22-job-original-share.md`](../plans/2026-07-22-job-original-share.md)
- Follow-up (not this MVP): gate upload/storage behind **Pro** subscription / quotas

## Post-implementation notes

- Changing `source_hash` via job PATCH revokes `job_originals` (meta) and deletes the disk file.
- Download `Content-Disposition` uses sanitized filenames (no header injection).
- Upload filename from `X-Filename` is basename-sanitized server-side.

## Goal

Let the **job owner** explicitly **upload the original DOCX** to the server (attached to the job). While the file exists, **any job member** (including viewer) can **download** it from the job hub. Owner can **replace** or **revoke**.

## Decisions

| Topic | Choice |
|-------|--------|
| When uploaded | Explicit owner action (“Share original”), not at job create |
| Who downloads | Any **member** (viewer included) |
| Replace / revoke | Both: owner replace + delete |
| UI | **Job hub** (`JobHubInline`) only |
| Storage | Filesystem under `BACKUP_DIR` + DB metadata (same pattern as project backups) |
| Hash check | Required: SHA-256 of body must equal `jobs.source_hash` (client + server) |
| Size limit | **50 MiB** (same as `MaxBackupBytes`) |
| Pro gate | Deferred; MVP unrestricted for authenticated members |

## Data model

**Table `job_originals`** (1:1 with `jobs`):

| Column | Notes |
|--------|--------|
| `job_id` | PK, FK → `jobs(id)` ON DELETE CASCADE |
| `filename` | Basename shown on download |
| `content_hash` | SHA-256 hex; must match `jobs.source_hash` at write time |
| `size_bytes` | |
| `storage_path` | Relative path under `BACKUP_DIR` |
| `uploaded_by` | User id |
| `uploaded_at` | UTC |

**Disk path:** `{BACKUP_DIR}/job-originals/{job_id}.docx`  
(Write via temp + rename, like backups.)

On job delete: CASCADE removes row; handler/cleanup must also remove the file (or orphan GC later — prefer delete file in same DELETE path).

## API

All routes require auth + active job membership (owner counts as member).

| Method | Path | Who | Behavior |
|--------|------|-----|----------|
| `PUT` | `/api/jobs/{id}/original` | **owner** only | Raw body = DOCX bytes. Reject if job has empty `source_hash`. Compute SHA-256; if ≠ `jobs.source_hash` → 400. Upsert file + `job_originals`. Optional header/`Content-Disposition` filename; else keep previous / `source_filename`. |
| `GET` | `/api/jobs/{id}/original` | any member | Stream file; `Content-Disposition: attachment` with stored filename. 404 if none. |
| `HEAD` | same | any member | Existence + `Content-Length` / Last-Modified without body. |
| `DELETE` | `/api/jobs/{id}/original` | **owner** only | Remove file + row. Idempotent OK (404 or 204 if already gone — prefer **204** if gone). |

**Job list/get JSON** (additive):

- `hasOriginal: boolean`
- `originalFilename?: string` (when `hasOriginal`)

Do not embed bytes in job payloads.

**Errors (stable codes / messages for i18n):**

| Condition | HTTP |
|-----------|------|
| Not member | 403 |
| Not owner on PUT/DELETE | 403 |
| Hash mismatch | 400 (`original hash mismatch` or similar) |
| Missing `source_hash` on job | 400 |
| Body too large | 413 |
| Empty body | 400 |
| No original on GET | 404 |

## UX (Job hub)

### Owner (not archived)

- No original → **Share original** → `.docx` file picker → client `fingerprintDocx` → if hash ≠ `job.sourceHash`, show error and do not upload → else `PUT`, refresh `hasOriginal`.
- Has original → **Download**, **Replace** (same validation as share), **Remove** (short confirm → `DELETE`).

### Member (any role, including viewer)

- `hasOriginal` → **Download original** (`GET`).
- No file → no download button (no disabled tease required).

### MVP source of file

Disk picker only. Optional later: “use current project DOCX if hash matches.”

## Client

- Thin API helpers next to existing jobs client (PUT with `ArrayBuffer`/`Blob`, GET → download blob).
- Reuse `fingerprintDocx` from `src/jobs/fingerprint.ts`.
- After PUT/DELETE, update local job object (`hasOriginal` / `originalFilename`) and/or reload hub.

## Out of scope

- Pro subscription / quota enforcement
- Auto-upload on job create
- Pull from local project without picker
- Object storage (S3), CDN, signed URLs
- Non-DOCX formats
- Version history (only current file)
- Editor toolbar / SharedWorkPanel duplicate controls

## Success criteria

1. Owner can share a DOCX whose hash matches the job fingerprint; wrong file is rejected client- and server-side.
2. Any member sees Download and receives the same bytes/filename.
3. Owner can replace and revoke; after revoke, members no longer see Download / GET 404.
4. Job delete removes metadata (CASCADE) and does not leave a reachable download.
5. Existing job flows unchanged when no original is shared.

## Testing (minimum)

- API: PUT mismatch → 400; PUT match → GET returns bytes; non-member 403; member GET OK; owner DELETE then GET 404; non-owner PUT/DELETE 403.
- Optional UI smoke: hub buttons visibility by role / `hasOriginal`.
