# Job TM attachments — Part 2 (API + sync list)

Date: 2026-07-20  
Status: Approved  
Related:

- [`2026-07-20-job-tm-attach-only-design.md`](./2026-07-20-job-tm-attach-only-design.md) — attach-only product model
- [`2026-07-20-tm-collection-part1-design.md`](./2026-07-20-tm-collection-part1-design.md) — client collection / stub
- [`2026-07-20-job-tm-attach-only.md`](../plans/2026-07-20-job-tm-attach-only.md) — phased plan (Phase 1)

## Goal

Replace the job attachments **localStorage stub** with a **server-backed list** that the **job owner** manages for the group. Members see that list; each member may keep a **local-only overlay** on top. Do **not** change editor match/write in this slice.

## Decisions

| Topic | Choice |
|-------|--------|
| What can be attached | Any collection base id (`personal`, named ids, …) as soft `tm_base_id` |
| Who mutates shared list | **Job owner only** |
| Members | Read shared list; optional **local overlay** (not synced) |
| Flags in schema/API | All four: `canRead`, `canWrite`, `canExport`, `canClone` |
| Flags in UI (Part 2) | Only **Ч/З** (`canRead` / `canWrite`); Export/Clone default `false` |
| Cross-user unit match | **Deferred** — Part 2 is CRUD + ACL + UI wiring only |
| Approach | Separate table + CRUD (not via `job_tm` resources/preset) |

### Sharing vs local (future-aware)

- Bases that are **shareable across accounts** (independent of a job) will need their own sync later.
- Until then: shared job list is **metadata**; unit availability for other members is **not** guaranteed in Part 2.
- Member extras beyond the owner list stay **local** (or later in that member’s own cloud); subscription/offline limits deferred.

## Schema: `job_tm_attachments`

| Column | Type | Notes |
|--------|------|--------|
| `id` | UUID PK | Attachment row id |
| `job_id` | UUID FK → `jobs` ON DELETE CASCADE | |
| `tm_base_id` | TEXT NOT NULL | Soft ref to collection base id |
| `can_read` | BOOLEAN NOT NULL DEFAULT true | |
| `can_write` | BOOLEAN NOT NULL DEFAULT false | |
| `can_export` | BOOLEAN NOT NULL DEFAULT false | API only in Part 2 |
| `can_clone` | BOOLEAN NOT NULL DEFAULT false | API only in Part 2 |
| `created_by` | UUID FK → `users` | Usually the owner |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

Constraints:

- `UNIQUE (job_id, tm_base_id)`
- No FK to a server TM catalog (catalog does not exist yet)
- Keep existing `job_tm_units` / presets; product path remains disabled

Default: empty list (nothing auto-attached).

## API

Auth: JWT. Authorize via job membership; mutations require **owner**.

| Method | Path | Who | Action |
|--------|------|-----|--------|
| `GET` | `/api/jobs/{id}/tm-attachments` | member | List |
| `POST` | `/api/jobs/{id}/tm-attachments` | owner | Attach |
| `PATCH` | `/api/jobs/{id}/tm-attachments/{attachmentId}` | owner | Patch flags |
| `DELETE` | `/api/jobs/{id}/tm-attachments/{attachmentId}` | owner | Detach |

**POST body:** `{ tmBaseId, canRead?, canWrite?, canExport?, canClone? }`  
Defaults when omitted: read `true`, write/export/clone `false`.

**Item response (camelCase):**

```json
{
  "id": "…",
  "jobId": "…",
  "tmBaseId": "personal",
  "canRead": true,
  "canWrite": false,
  "canExport": false,
  "canClone": false,
  "createdBy": "…",
  "createdAt": "…",
  "updatedAt": "…"
}
```

**Errors:**

- Non-member → same 403/404 policy as other job endpoints
- Non-owner mutation → 403
- Duplicate `(jobId, tmBaseId)` → 409
- Viewer: may **GET**; may not mutate

**Not in Part 2:** export/clone action endpoints; unit sync for foreign bases.

## Client / UI

### Two layers in «Памяти»

1. **Базы работы** (server) — owner edits; members/viewers read-only (no `+` / `−` / checkbox edits).
2. **Мои доп.** (local) — member overlay via existing localStorage helper (narrowed); never POSTed as job attachments.

### Behavior

- On panel open: `GET …/tm-attachments` fills the shared list.
- Owner: `+` / Ч/З / `−` → POST / PATCH / DELETE; optimistic UI with rollback on error.
- Personal row («всегда · только вы») unchanged — not part of the server list.
- UI exposes only Read/Write; Export/Clone stay API defaults.
- New client module for API (e.g. `src/jobs/tmAttachmentsApi.ts`); stub module becomes **local overlay only**.
- **Editor match/write unchanged** in Part 2.

### Stub migration

No automatic push of localStorage job attachments to the server when the list is empty. Owner re-attaches explicitly (avoids wrong ids / cross-device surprises). Optional migration later.

## Out of scope

- Editor match ∪ attached Read; write to attached Write (including other users’ bases)
- Sync of shareable / foreign TM units
- Export / Clone API actions and UI
- Auto-migration localStorage → server
- Server-side TM base catalog / FK on `tm_base_id`
- Dropping `job_tm_units` / resource presets
- Subscription / offline limits for overlays
- Create / Import / Clone collection UX (TM collection later parts)

## Success criteria

- [ ] Migration + CRUD API; owner mutates, member reads, non-member denied
- [ ] Four flags in schema and JSON; UI only Read/Write
- [ ] Job «Памяти»: server list + owner ACL; local overlay not written to server
- [ ] Duplicate attach → 409
- [ ] Go integration tests + client tests for API/store layer
- [ ] Editor personal-TM behavior does not regress

## Follow-ups

1. Wire editor match/write to shared attachments once unit access exists for readable bases.
2. Shareable TM bases (catalog + sync) independent of a single job.
3. Export / Clone endpoints and ACL UI.
4. Optional one-shot stub → server migration for owners.
