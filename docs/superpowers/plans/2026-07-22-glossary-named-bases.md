# Glossary Named Bases + Job Share Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Named glossary bases mirroring TM — local catalog + `baseId`, cloud per-base sync, job attachments R/W/E/C, editor highlight ∪ Readable / write → Writable, Export TBX / Clone — per [`2026-07-22-glossary-named-bases-design.md`](../specs/2026-07-22-glossary-named-bases-design.md).

**Architecture:** Copy TM patterns into `glossary_*` (not a shared ResourceStore). Remove legacy bulk `/api/glossary/sync`. Personal id = `personal-glossary` (not special). Shared local ids `share:{ownerId}:{baseId}`. Promote on job attach; member sync via `?jobId=`.

**Tech Stack:** Go (chi, pgx, goose), Vue 3, TypeScript, idb, Vitest, vue-i18n; mirror `tm_bases` / `job_tm_attachments` / `jobTmIo`.

## Global Constraints

- Mirror TM; separate `glossary_*` tables (no ResourceStore merge)
- Personal id: **`personal-glossary`** — attach-only for highlight/write
- Job ACL: **R / W / E / C**; defaults on attach: **R on, W/E/C off**
- Writes under **base owner** `user_id`; LWW on term `id`
- Auto-promote catalog + terms on job attach
- Export/Clone: **client IO** only (TBX / clone into owned base)
- **Remove** `GET/POST /api/glossary/sync`
- No project cross-user sync; no standalone share; no Pro gate
- No email in glossary UI

## File map

| File | Role |
|------|------|
| `api/migrations/020_glossary_bases.sql` | `glossary_bases` + `glossary_terms.base_id` + `job_glossary_attachments` |
| `api/internal/glossary/unit.go` | `BaseID` on term |
| `api/internal/glossary/store.go` | Pull/Upsert by base; EnsureBase |
| `api/internal/glossary/bases.go` | Catalog CRUD |
| `api/internal/glossary/access.go` | Owner or job attachment R/W |
| `api/internal/glossary/handlers.go` | Catalog + per-base sync; delete legacy Pull/Push |
| `api/internal/jobs/glossary_attachments.go` | Store CRUD (mirror attachments.go) |
| `api/internal/jobs/glossary_attachment_handlers.go` | HTTP + promote |
| `api/internal/httpapi/router.go` | Register routes; drop legacy glossary sync |
| `src/types/glossary.ts` | `baseId` on `GlossaryTerm`; attachment types |
| `src/storage/glossaryBasesIdb.ts` | Catalog + `sharedGlossaryLocalId` |
| `src/storage/glossaryIdb.ts` | Terms by `baseId`; migrate missing → personal |
| `src/glossary/glossaryBasesCatalog.ts` | Catalog helpers |
| `src/glossary/glossaryAccess.ts` | readable/writable/exportable/cloneable sets |
| `src/glossary/api.ts` | Bases + per-base sync client |
| `src/glossary/sync.ts` | `syncGlossaryBase`; remove bulk `syncGlossary` or make it orchestrate owned bases only for bootstrap |
| `src/jobs/glossaryAttachmentsApi.ts` | Job attachment client |
| `src/glossary/jobGlossaryIo.ts` | Export TBX / clone helpers |
| `src/components/GlossaryCollectionDialog.vue` | Create / Import TBX / delete |
| `src/components/GlossaryPanel.vue` | Base-aware CRUD |
| `src/components/JobMemoriesPanel.vue` or `JobGlossaryPanel.vue` | Attach + R/W/E/C + Export/Clone |
| `src/pages/EditorPage.vue` / `ParagraphBlock.vue` | Access sets + highlight/write |
| `src/auth/session.ts` | Bootstrap catalog sync |
| `src/i18n/locales/{en,ru}.ts` | Copy |
| tests | match/access/idb; Go sync ACL; UI wiring smoke |

---

### Task 1: Client — types, catalog, IDB `baseId`, access helpers

**Files:**
- Modify: `src/types/glossary.ts`
- Create: `src/storage/glossaryBasesIdb.ts`
- Modify: `src/storage/glossaryIdb.ts`
- Create: `src/glossary/glossaryBasesCatalog.ts`
- Create: `src/glossary/glossaryAccess.ts`
- Test: `tests/glossary/glossaryIdb.test.ts`, `tests/glossary/glossaryAccess.test.ts`

**Interfaces:**
- Produces:
  - `PERSONAL_GLOSSARY_BASE_ID = 'personal-glossary'`
  - `GlossaryTerm.baseId: string`
  - `sharedGlossaryLocalId(ownerId, baseId) → string` (same format as TM: `share:${ownerId}:${baseId}`)
  - `ensurePersonalGlossaryBase()`, `listGlossaryBases()`, `createGlossaryBase({ label, color? })`, `deleteGlossaryBase(id)` (personal → clear terms only)
  - `listGlossaryTerms({ baseIds?: string[] })`, `clearGlossaryTerms(baseId?)`
  - `resolveGlossaryAccess(input) → { readableBaseIds, writableBaseIds, exportableBaseIds, cloneableBaseIds }`

- [ ] **Step 1: Write failing tests** for migration default `baseId`, list by baseIds, access sets from mock job attachments (R/W/E/C).

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test -- --pool=threads tests/glossary/glossaryIdb.test.ts tests/glossary/glossaryAccess.test.ts
```

- [ ] **Step 3: Implement** types + IDB bump + catalog + access (mirror `tmBasesIdb` / `tmAccess` / `tmBasesCatalog`).

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/types/glossary.ts src/storage/glossaryBasesIdb.ts src/storage/glossaryIdb.ts src/glossary/glossaryBasesCatalog.ts src/glossary/glossaryAccess.ts tests/glossary/
git commit -m "feat: glossary named bases catalog and baseId in IDB"
```

---

### Task 2: Server — migration, catalog, per-base sync, drop legacy

**Files:**
- Create: `api/migrations/020_glossary_bases.sql`
- Modify: `api/internal/glossary/*`
- Modify: `api/internal/httpapi/router.go`
- Test: `api/internal/glossary/bases_sync_test.go` (new or extend `sync_test.go`)

**Interfaces:**
- Produces: `Term.BaseID`; `EnsureBase`; `PullByBase` / `Upsert` with `base_id`; handlers for `/api/glossary/bases` and `/api/glossary/bases/{baseId}/sync`
- Removes: router registration of `/api/glossary/sync`

- [ ] **Step 1: Migration** (goose Up/Down)

```sql
-- +goose Up
CREATE TABLE IF NOT EXISTS glossary_bases (
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  label TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#5b9fd4',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  PRIMARY KEY (owner_id, id)
);

ALTER TABLE glossary_terms
  ADD COLUMN IF NOT EXISTS base_id TEXT NOT NULL DEFAULT 'personal-glossary';

UPDATE glossary_terms SET base_id = 'personal-glossary'
  WHERE base_id IS NULL OR base_id = '';

CREATE INDEX IF NOT EXISTS glossary_terms_user_base_updated
  ON glossary_terms (user_id, base_id, updated_at);

INSERT INTO glossary_bases (owner_id, id, label, color, created_at, updated_at)
SELECT DISTINCT user_id, 'personal-glossary', 'Personal glossary', '#5b9fd4', now(), now()
FROM glossary_terms
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS job_glossary_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  glossary_base_id TEXT NOT NULL,
  can_read BOOLEAN NOT NULL DEFAULT true,
  can_write BOOLEAN NOT NULL DEFAULT false,
  can_export BOOLEAN NOT NULL DEFAULT false,
  can_clone BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, glossary_base_id)
);

CREATE INDEX IF NOT EXISTS job_glossary_attachments_job_id ON job_glossary_attachments (job_id);

-- +goose Down
DROP TABLE IF EXISTS job_glossary_attachments;
DROP INDEX IF EXISTS glossary_terms_user_base_updated;
ALTER TABLE glossary_terms DROP COLUMN IF EXISTS base_id;
DROP TABLE IF EXISTS glossary_bases;
```

(If label/color columns on attachments are needed for member UI like TM, add them in same migration or follow TM’s later enrich pattern — check `job_tm_attachments` current columns and mirror.)

- [ ] **Step 2: Failing integration test** — owner push/pull by base; non-owner without job → 403; remove expectations on `/api/glossary/sync` (404 or gone).

- [ ] **Step 3: Implement** store/handlers/access (copy `api/internal/tm/bases.go` + access patterns). Delete or stop registering legacy Pull/Push on `/sync`.

- [ ] **Step 4: Run**

```bash
cd api && go test ./internal/glossary/ -count=1
cd api && go test ./internal/httpapi/ -count=1
```

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: glossary bases cloud catalog and per-base sync"
```

---

### Task 3: Job glossary attachments API

**Files:**
- Create: `api/internal/jobs/glossary_attachments.go`
- Create: `api/internal/jobs/glossary_attachment_handlers.go`
- Modify: `api/internal/httpapi/router.go`
- Modify: `api/internal/jobs/glossary_attachment_handlers.go` — promote/`EnsureBase` on create (call glossary store)
- Test: `api/internal/jobs/glossary_attachments_integration_test.go`

**Interfaces:**
- Produces: `GET/POST /api/jobs/{id}/glossary-attachments`, `PATCH/DELETE …/{attachmentId}`
- JSON shape parallel to `JobTmAttachment` (`glossaryBaseId`, `canRead`, `canWrite`, `canExport`, `canClone`, `label?`, `color?`, `ownerId?`)

- [ ] **Step 1: Failing tests** — owner create with defaults R; patch E/C; member list; non-owner POST 403.

- [ ] **Step 2: Implement** mirror `attachments.go` / `attachment_handlers.go`.

- [ ] **Step 3: Run tests; commit**

```bash
git commit -m "feat: job glossary attachments CRUD with R/W/E/C"
```

---

### Task 4: Client cloud sync + promote + session

**Files:**
- Modify: `src/glossary/api.ts`, `src/glossary/sync.ts`
- Create: `src/jobs/glossaryAttachmentsApi.ts`
- Modify: `src/auth/session.ts` (stop calling bulk sync; sync owned bases / personal)
- Modify: types in `src/types/job.ts` for `JobGlossaryAttachment`
- Test: `tests/glossary/sync.test.ts` (mock fetch)

**Interfaces:**
- Produces:
  - `listGlossaryBasesApi`, `upsertGlossaryBaseApi`, `pullGlossaryBaseSync`, `pushGlossaryBaseSync`
  - `syncGlossaryBase(baseId, { jobId? })`
  - `listJobGlossaryAttachments`, `createJobGlossaryAttachment` (promote: ensure cloud base + push terms then POST), `patch` / `delete`
- On create attachment: ensure local catalog row exists; push base + terms; then POST attachment.

- [ ] **Step 1: Failing unit tests** for sync cursor keys per `(user, baseId, jobId?)` and promote order.

- [ ] **Step 2: Implement**; wire session bootstrap to `ensurePersonalGlossaryBase` + sync owned catalog/bases.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: client glossary per-base sync and job attach promote"
```

---

### Task 5: Collection UI + job E/C + editor

**Files:**
- Create: `src/components/GlossaryCollectionDialog.vue` (or extend projects shell entry next to TM collection)
- Modify: `src/components/GlossaryPanel.vue` — filter/write by base
- Modify: `src/components/JobMemoriesPanel.vue` **or** add `JobGlossaryPanel.vue` section — attach list, R/W/E/C, Export/Clone
- Create: `src/glossary/jobGlossaryIo.ts` — mirror `jobTmIo` with TBX + clone
- Modify: `src/pages/EditorPage.vue` — load terms for `readableBaseIds`; sync readable shared bases when `jobId`; write new terms to writable bases
- Modify: `src/i18n/locales/en.ts`, `ru.ts`
- Test: `tests/glossary/jobGlossaryIo.test.ts`; component tests if pattern exists for JobMemoriesPanel

**Interfaces:**
- Consumes: access helpers, attachments API, `exportTbx` / parseTbx, catalog
- Produces: UI flows matching TM collection + Memories E/C

- [ ] **Step 1: IO helpers tests** (export count; clone retags `baseId` to target owned base; sync-if-empty).

- [ ] **Step 2: Implement UI** — hide E/C buttons when flags off; clone picker = owned glossary bases including personal.

- [ ] **Step 3: Editor** — if personal not in readable set, no hits from it; multi-writable → simple picker or write-to-all (match TM: write to **all** writable — prefer same as TM for parity).

- [ ] **Step 4: Manual smoke** — create named glossary, attach to job, second user Read highlight, Write term, Export/Clone with flags.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: glossary collection and job share UI with export/clone"
```

- [ ] **Step 6: Update `PLAN.md`** — mark C2 done; note legacy glossary sync removed.

```bash
git commit -m "docs: mark glossary C2 named bases complete in PLAN"
```

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| Catalog + `baseId` + personal migrate | 1, 2 |
| Remove legacy `/api/glossary/sync` | 2, 4 |
| Per-base cloud sync + ACL | 2, 4 |
| Job attachments R/W/E/C | 3, 5 |
| Promote on attach | 3–4 |
| Editor union / detached personal | 5 |
| Export TBX / Clone client | 5 |
| No project cross-user | — (out of scope) |

## Self-review notes

- Migration number **020** assumes `019_job_originals` already on main.
- Confirm whether `job_tm_attachments` stores label/color columns; mirror exactly for glossary.
- Write-to-all Writable bases = TM parity (explicit in Task 5).
- Prefer extracting only `share:` id helper duplication if trivial; do not build ResourceStore.
