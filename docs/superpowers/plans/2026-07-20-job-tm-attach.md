# Job TM Attach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire explicit job TM attach (one shared pool per job) with light «Памяти» UI, offline IDB cache, cloud sync, match union, and dual-write on confirm — without auto-seeding shared TM and without deferred stack / soft-warn (later slices).

**Architecture:** Reuse existing Postgres `job_tm_units` + resource preset/override APIs. Add preset-level `enabled` (default off). Client mirrors personal TM: per-job IDB cache + dirty/since sync. Editor matches personal ∪ job cache when Read; always writes personal; additionally writes job TM when Write.

**Tech Stack:** Vue 3 + TypeScript + IndexedDB (`idb`); Go + chi + Postgres; Vitest + Go integration tests.

**Spec:** [`docs/superpowers/specs/2026-07-20-job-tm-attach-design.md`](../specs/2026-07-20-job-tm-attach-design.md)

## Global Constraints

- Model A only: one `job_tm` pool per job — do **not** attach personal TM by reference
- Job TM starts **off** until owner enables (no surprise sharing)
- Dual-write: personal **always** + job TM when effective Write
- Never show email in TM attribution / job UI — nick / `anon:{userId}`
- Offline unit match/write against cache; ACL toggle edits require network
- No deferred write stack, no soft-warn re-wire, no glossary attach in this plan
- Do not revive auto-seed of `job_tm` on `CreateJob`

## File map

| Create | Role |
|--------|------|
| `api/migrations/015_job_tm_preset_enabled.sql` | `enabled` on `job_resource_presets`, default false |
| `src/jobs/tmApi.ts` | HTTP: resources + job TM pull/push |
| `src/storage/jobTmIdb.ts` | Per-account+job IndexedDB cache for job TM units |
| `src/jobs/tmSync.ts` | Pull/push + dirty/since for one job |
| `src/jobs/resources.ts` | Cache effective `JobResource`; helpers for Read/Write |
| `src/components/JobMemoriesPanel.vue` | «Памяти» UI (personal + job TM toggles) |
| `tests/jobs/resources.test.ts` | Pure helpers: readable/writable, clamp |
| `tests/jobs/matchUnion.test.ts` | Personal ∪ job units for match |

| Modify | Role |
|--------|------|
| `api/internal/jobs/tm.go` | Preset `enabled`; upsert ensure; effective query |
| `api/internal/jobs/tm_handlers.go` | Patch preset creates row if missing; return full Resource |
| `api/internal/jobs/tm_integration_test.go` | Off-by-default; enable; sync ACL |
| `src/types/job.ts` | Confirm types match API (already close) |
| `src/components/SharedWorkPanel.vue` | Embed `JobMemoriesPanel` |
| `src/pages/EditorPage.vue` | Load rights + sync; match union; dual-write |
| `src/auth/session.ts` | Optional: sync job TMs for known jobs on login (light) |
| `src/i18n/locales/ru.ts`, `en.ts` | Memories copy + privacy note |
| `PLAN.md` | Check J2 attach boxes |
| `docs/superpowers/plans/2026-07-17-shared-work-jobs.md` | Mark Task 14 done when finished |

---

### Task 1: Preset `enabled` + ensure-on-patch (Go)

**Files:**
- Create: `api/migrations/015_job_tm_preset_enabled.sql`
- Modify: `api/internal/jobs/tm.go`
- Modify: `api/internal/jobs/tm_handlers.go` (preset patch response)
- Modify: `api/internal/jobs/tm_integration_test.go`
- Test: `go test ./internal/jobs -run JobTM -count=1` (with `DATABASE_URL`)

**Interfaces:**
- Consumes: existing `Resource`, `ResourcePatch`, `JobTMResourceKind`
- Produces: preset rows have `enabled`; `PatchResourcePreset` upserts; `EffectiveResource` uses `p.enabled AND COALESCE(o.enabled, true)` for `Resource.Enabled`

- [ ] **Step 1: Add migration**

```sql
-- +goose Up
ALTER TABLE job_resource_presets
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT false;

-- Existing seeded presets (migration 013 backfill) must not surprise-share:
UPDATE job_resource_presets SET enabled = false WHERE kind = 'job_tm';

-- +goose Down
ALTER TABLE job_resource_presets DROP COLUMN IF EXISTS enabled;
```

- [ ] **Step 2: Update `effectiveResourcesQuery` in `tm.go`**

Replace the `COALESCE(o.enabled, true)` select with:

```sql
(p.enabled AND COALESCE(o.enabled, true)) AS enabled
```

Also select `p.enabled` if handlers need preset-level flag separately — keep `Resource.Enabled` as **effective** enabled (preset off ⇒ everyone off).

- [ ] **Step 3: Change `PatchResourcePreset` to UPSERT**

When owner patches and row is missing, insert:

```go
// kind must be JobTMResourceKind; empty patch invalid (unchanged).
// UPSERT:
// INSERT ... (job_id, kind, enabled, can_read, can_write, can_export, can_clone)
// VALUES ($1, $2, COALESCE($3,false), COALESCE($4,true), COALESCE($5,true), COALESCE($6,false), COALESCE($7,false))
// ON CONFLICT (job_id, kind) DO UPDATE SET
//   enabled = COALESCE($3, job_resource_presets.enabled),
//   can_read = COALESCE($4, ...), ...
// RETURNING can_read, can_write, can_export, can_clone
```

Return type: change to `Resource` (or keep ACL + separate enabled) so client gets `enabled`. Prefer returning full `Resource` for the calling owner via `EffectiveResource` after patch (same pattern as `PatchMemberResource`).

Update handler `PatchResourcePreset` to `writeJSON` the `Resource` from `EffectiveResource` after successful patch.

- [ ] **Step 4: Integration tests**

In `tm_integration_test.go`:

1. Create job → `ListResources` empty or job_tm missing / disabled — **no** auto enable.
2. Owner `PatchResourcePreset` `{enabled: true, canRead: true, canWrite: true}` → row exists, effective enabled.
3. Translator without override → Read+Write from preset.
4. Viewer → no Write.
5. Preset `enabled: false` → PullJobTM returns 403 even if can_read true.
6. Translator override `enabled: false` → 403 for that user while owner still ok.

Run (needs DB):

```bash
cd api && go test ./internal/jobs -run 'Resource|JobTM' -count=1
```

Expected: PASS (skip/fail clearly if `DATABASE_URL` unset — follow existing test skip pattern).

- [ ] **Step 5: Commit**

```bash
git add api/migrations/015_job_tm_preset_enabled.sql api/internal/jobs/tm.go api/internal/jobs/tm_handlers.go api/internal/jobs/tm_integration_test.go
git commit -m "Add job TM preset enabled flag and upsert on owner patch."
```

---

### Task 2: Client HTTP — resources + job TM sync

**Files:**
- Create: `src/jobs/tmApi.ts`
- Modify: `src/types/job.ts` only if response shapes need tweaks
- Test: none required beyond TypeScript compile (thin wrappers)

**Interfaces:**
- Consumes: `apiFetch`, `TmUnit`, `TmPullResponse` / `TmPushResponse` from `@/tm/api` (re-export or import types)
- Produces:
  - `listJobResources(jobId: string): Promise<JobResource[]>`
  - `patchJobResourcePreset(jobId: string, input: PatchJobResourceInput): Promise<JobResource>`
  - `patchJobResourceMe(jobId: string, input: PatchJobResourceInput): Promise<JobResource>`
  - `pullJobTmSync(jobId: string, since: string): Promise<TmPullResponse>`
  - `pushJobTmSync(jobId: string, units: TmUnit[]): Promise<TmPushResponse>`

- [ ] **Step 1: Implement `src/jobs/tmApi.ts`**

```ts
import { apiFetch } from '@/auth/api'
import type { JobResource, PatchJobResourceInput } from '@/types/job'
import type { TmPullResponse, TmPushResponse } from '@/tm/api'
import type { TmUnit } from '@/types/tm'

export async function listJobResources(jobId: string) {
  return apiFetch<JobResource[]>(`/api/jobs/${jobId}/resources`)
}

export async function patchJobResourcePreset(jobId: string, input: PatchJobResourceInput) {
  return apiFetch<JobResource>(`/api/jobs/${jobId}/resources/preset`, {
    method: 'PATCH',
    body: JSON.stringify({ kind: 'job_tm', ...input }),
  })
}

export async function patchJobResourceMe(jobId: string, input: PatchJobResourceInput) {
  return apiFetch<JobResource>(`/api/jobs/${jobId}/resources/me`, {
    method: 'PATCH',
    body: JSON.stringify({ kind: 'job_tm', ...input }),
  })
}

export async function pullJobTmSync(jobId: string, since: string) {
  const q = encodeURIComponent(since)
  return apiFetch<TmPullResponse>(`/api/jobs/${jobId}/tm/sync?since=${q}`)
}

export async function pushJobTmSync(jobId: string, units: TmUnit[]) {
  return apiFetch<TmPushResponse>(`/api/jobs/${jobId}/tm/sync`, {
    method: 'POST',
    body: JSON.stringify({ units }),
  })
}
```

Ensure `JobResource.kind` remains `'job_tm'`. If list returns empty when no preset, treat as disabled in UI (Task 5).

- [ ] **Step 2: Commit**

```bash
git add src/jobs/tmApi.ts src/types/job.ts
git commit -m "Add client API for job resources and job TM sync."
```

---

### Task 3: Job TM IndexedDB cache

**Files:**
- Create: `src/storage/jobTmIdb.ts`
- Create: `tests/jobs/matchUnion.test.ts` (pure merge helper can live here or in `resources.ts` — prefer export `mergeUnitsForMatch` from `jobTmIdb` or `resources`)

**Interfaces:**
- Consumes: `TmUnit`, `getStorageAccountId` from `@/storage/scope`
- Produces:
  - `listJobTmUnits(jobId: string): Promise<TmUnit[]>` (active only)
  - `getJobTmUnit(jobId: string, id: string): Promise<TmUnit | undefined>`
  - `putJobTmUnit(jobId: string, unit: TmUnit): Promise<void>`
  - `removeJobTmUnit(jobId: string, id: string): Promise<void>` (hard delete row or keep tombstone — mirror personal: store tombstone in put)
  - `upsertJobTmFromSegment(jobId, segment, options): Promise<string | null>` — same rules as `upsertTmFromSegment`
  - `recordDoneSegmentsInJobTm(jobId, segments, options): Promise<string[]>`

DB name pattern: `appzac-job-tm:${accountId}:${jobId}` (or one DB `appzac-job-tm` with `jobId` index — prefer **one DB per account** `appzac-job-tm:${accountId}` with store keyed by `id` and index `by-job` / compound — simplest MVP: **separate DB per job** like above to copy personal sync logic).

Mirror personal `upsertTmFromSegment` logic (copy, do not import private helpers if not exported — duplicate minimal block or extract shared `buildTmUnitFromSegment` in a follow-up; for this task **duplicate the upsert body** into `jobTmIdb` to avoid wide refactor).

- [ ] **Step 1: Write pure test for match merge**

```ts
// tests/jobs/matchUnion.test.ts
import { describe, expect, it } from 'vitest'
import { mergeTmUnitsForMatch } from '@/jobs/resources'
import type { TmUnit } from '@/types/tm'

function u(id: string, source: string, target: string): TmUnit {
  return {
    id, source, target, sourceKey: source,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('mergeTmUnitsForMatch', () => {
  it('concatenates personal and job units', () => {
    const out = mergeTmUnitsForMatch([u('p', 'a', 'A')], [u('j', 'b', 'B')])
    expect(out.map(x => x.id).sort()).toEqual(['j', 'p'])
  })

  it('skips deleted job units', () => {
    const out = mergeTmUnitsForMatch(
      [],
      [{ ...u('j', 'b', 'B'), deletedAt: '2026-01-02T00:00:00.000Z' }],
    )
    expect(out).toEqual([])
  })
})
```

- [ ] **Step 2: Run test — expect FAIL (module missing)**

```bash
npx vitest run tests/jobs/matchUnion.test.ts
```

- [ ] **Step 3: Implement `mergeTmUnitsForMatch` in `src/jobs/resources.ts` (stub file ok) + `jobTmIdb.ts`**

```ts
// resources.ts
export function mergeTmUnitsForMatch(personal: TmUnit[], job: TmUnit[]): TmUnit[] {
  const active = (u: TmUnit) => !u.deletedAt
  return [...personal.filter(active), ...job.filter(active)]
}

export function jobTmReadable(resource: JobResource | null | undefined): boolean {
  return Boolean(resource?.enabled && resource.canRead)
}

export function jobTmWritable(resource: JobResource | null | undefined): boolean {
  return Boolean(resource?.enabled && resource.canWrite)
}
```

Implement IDB with `openDB` from `idb`, store `units`, keyPath `id`.

- [ ] **Step 4: Re-run vitest — PASS**

- [ ] **Step 5: Commit**

```bash
git add src/storage/jobTmIdb.ts src/jobs/resources.ts tests/jobs/matchUnion.test.ts
git commit -m "Add job TM IndexedDB cache and match merge helper."
```

---

### Task 4: Job TM sync (client)

**Files:**
- Create: `src/jobs/tmSync.ts`
- Modify: `src/jobs/resources.ts` — cache last known `JobResource` per jobId in memory + `localStorage` JSON for offline match gates

**Interfaces:**
- Consumes: `pullJobTmSync`, `pushJobTmSync`, `jobTmIdb`, `jobTmReadable`
- Produces:
  - `syncJobTm(jobId: string, opts?: { pushOnly?: boolean }): Promise<void>`
  - `markJobTmDirty(jobId: string, ...ids: string[]): void`
  - `scheduleJobTmPush(jobId: string, delayMs?: number): void`
  - `cacheJobResource(jobId: string, resource: JobResource | null): void`
  - `readCachedJobResource(jobId: string): JobResource | null`
  - `loadJobResource(jobId: string): Promise<JobResource | null>` — network list, find `job_tm`, cache; on failure return cache

Mirror `src/tm/sync.ts`: localStorage keys `appzac-job-tm-sync-since:${account}:${jobId}` and `...-dirty:...`.

Merge remote: if local newer, keep dirty; else put remote (including tombstone → put with deletedAt or remove).

- [ ] **Step 1: Implement sync + resource cache**

`loadJobResource`:

```ts
export async function loadJobResource(jobId: string): Promise<JobResource | null> {
  try {
    const list = await listJobResources(jobId)
    const resource = list.find(r => r.kind === 'job_tm') ?? null
    cacheJobResource(jobId, resource)
    return resource
  } catch {
    return readCachedJobResource(jobId)
  }
}
```

- [ ] **Step 2: Manual smoke (optional in commit message)** — enable preset via curl, push one unit, pull on second account. If no two accounts, rely on Go tests + later UI.

- [ ] **Step 3: Commit**

```bash
git add src/jobs/tmSync.ts src/jobs/resources.ts
git commit -m "Sync job TM cache with dirty/since and cache resource ACL."
```

---

### Task 5: «Памяти» UI

**Files:**
- Create: `src/components/JobMemoriesPanel.vue`
- Modify: `src/components/SharedWorkPanel.vue` — section after members / before invites
- Modify: `src/i18n/locales/ru.ts`, `en.ts`

**Interfaces:**
- Consumes: `loadJobResource`, `patchJobResourcePreset`, `patchJobResourceMe`, `jobTmReadable`/`Writable`, `syncJobTm`, `isOwner` from parent
- Produces: emits nothing required; refreshes local resource state; calls `syncJobTm` when enabled+Read after successful patch

- [ ] **Step 1: Add i18n keys**

```ts
// under a `jobMemories` or `sharedWork` namespace — pick `jobs.memories*`
memoriesTitle: 'Памяти' / 'Memories'
memoriesPersonal: 'Личная ТМ' / 'Personal TM'
memoriesPersonalHint: 'всегда · только вы' / 'always · only you'
memoriesJob: 'ТМ работы' / 'Job TM'
memoriesJobOff: 'Общая ТМ выключена — каждый работает со своей.'
memoriesRead: 'Читать' / 'Read'
memoriesWrite: 'Писать' / 'Write'
memoriesWritePrivacy: 'Запись попадает в облако и видна участникам с доступом на чтение.'
memoriesNeedNetwork: 'Нужен интернет, чтобы изменить доступ.'
memoriesViewerNoWrite: 'Наблюдатель не может писать в ТМ работы.'
```

- [ ] **Step 2: Implement `JobMemoriesPanel.vue`**

Props: `jobId: string`, `isOwner: boolean`, `myRole: JobRole | null`.

Behaviour:

| Role | Read toggle | Write toggle |
|------|-------------|--------------|
| owner | patches **preset** `enabled`+`canRead` (Read off ⇒ `enabled: false` or `canRead: false` — product: **Read off = `enabled: false`**; Write is `canWrite`) | patches preset `canWrite` |
| translator | patches **me** override: Read off → `enabled: false`; cannot exceed preset (disable Write control if `!preset.canWrite`) | patches me `canWrite` |
| viewer | Read display only if preset allows; controls disabled | hidden/disabled |

On Write checked → show privacy line.

If `!navigator.onLine` on toggle → set error to `memoriesNeedNetwork`, do not optimistically flip.

After successful owner enable → `void syncJobTm(jobId)`.

UI structure: simple list, checkboxes, no card matrix.

- [ ] **Step 3: Mount inside `SharedWorkPanel.vue`**

After progress / members block, before invites:

```vue
<JobMemoriesPanel
  v-if="job"
  :job-id="jobId"
  :is-owner="isOwner"
  :my-role="myMember?.role ?? null"
/>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/JobMemoriesPanel.vue src/components/SharedWorkPanel.vue src/i18n/locales/ru.ts src/i18n/locales/en.ts
git commit -m "Add Memories panel for job TM Read/Write toggles."
```

---

### Task 6: Editor — match union + dual-write + sync on open

**Files:**
- Modify: `src/pages/EditorPage.vue`
- Create: `tests/jobs/resources.test.ts` (readable/writable helpers if not already covered)

**Interfaces:**
- Consumes: `loadJobResource`, `syncJobTm`, `markJobTmDirty`, `listJobTmUnits`, `recordDoneSegmentsInJobTm`, `mergeTmUnitsForMatch`, `jobTmReadable`, `jobTmWritable`
- Produces: editor uses merged units for match; confirm/autosave dual-writes when writable

- [ ] **Step 1: Helper tests**

```ts
// tests/jobs/resources.test.ts
import { describe, expect, it } from 'vitest'
import { jobTmReadable, jobTmWritable } from '@/jobs/resources'
import type { JobResource } from '@/types/job'

const base: JobResource = {
  kind: 'job_tm',
  enabled: true,
  canRead: true,
  canWrite: true,
  canExport: false,
  canClone: false,
  preset: { canRead: true, canWrite: true, canExport: false, canClone: false },
}

describe('jobTmReadable/Writable', () => {
  it('requires enabled', () => {
    expect(jobTmReadable({ ...base, enabled: false })).toBe(false)
    expect(jobTmWritable({ ...base, enabled: false })).toBe(false)
  })
  it('respects flags', () => {
    expect(jobTmWritable({ ...base, canWrite: false })).toBe(false)
    expect(jobTmReadable({ ...base, canRead: false })).toBe(false)
  })
})
```

- [ ] **Step 2: Run — PASS after helpers exist (Task 3)**

- [ ] **Step 3: Wire EditorPage**

When `record.value?.meta.jobId` is set:

1. On project load / jobId change: `const res = await loadJobResource(jobId)`; if `jobTmReadable(res)` → `await syncJobTm(jobId)`; `jobTmUnits = await listJobTmUnits(jobId)`.
2. Replace match source:

```ts
const matchTmUnits = computed(() =>
  mergeTmUnitsForMatch(tmUnits.value, jobTmReadable(jobResource.value) ? jobTmUnits.value : []),
)
```

3. After `recordDoneSegmentsInTm(...)` (manual + autosave paths), if `jobTmWritable(jobResource.value)` and `jobId`:

```ts
const jobDirty = await recordDoneSegmentsInJobTm(jobId, segments, { ...same options })
if (jobDirty.length) markJobTmDirty(jobId, ...jobDirty)
```

4. Refresh `jobTmUnits` after dual-write when readable.

Do **not** write job TM on intentional-empty confirms (same guard as personal).

- [ ] **Step 4: Run client tests**

```bash
npx vitest run tests/jobs
npx vue-tsc --noEmit
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/EditorPage.vue tests/jobs/resources.test.ts
git commit -m "Union job TM into matches and dual-write on confirm."
```

---

### Task 7: Login / online hooks + PLAN

**Files:**
- Modify: `src/auth/session.ts` — after `syncTm()`, if lightweight list of job ids is available from `listJobs()`, for each job with cached readable resource call `syncJobTm` (best-effort; catch errors)
- Modify: online banner / `useOnlineStatus` consumer if one already re-syncs TM — add `syncJobTm` for open editor jobId only to avoid storms (prefer **editor + SharedWorkPanel** sync over global fan-out)
- Modify: `PLAN.md` — check J2 attach lines
- Modify: `docs/superpowers/plans/2026-07-17-shared-work-jobs.md` — Task 14 steps checked; note Task 13 next

**Recommendation for session:** do **not** sync all jobs on login in v1 (N jobs × pull). Only:

- `SharedWorkPanel` / `JobMemoriesPanel` on open
- `EditorPage` when `meta.jobId` set
- optional: when `navigator.onLine` flips true, editor re-calls `syncJobTm(currentJobId)`

- [ ] **Step 1: Wire online re-sync in EditorPage** (watch online → syncJobTm)

- [ ] **Step 2: Update PLAN.md**

```markdown
**J2 — живые базы**

- [x] Пресет ресурсов на job + override у участника (Read/Write) — job TM attach UI
- [x] Live shared TM через attach (job_tm pool + client sync)
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/EditorPage.vue PLAN.md docs/superpowers/plans/2026-07-17-shared-work-jobs.md
git commit -m "Hook job TM resync on online and mark J2 attach done in PLAN."
```

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| One job_tm pool (model A) | 1–7 (no personal-ref attach) |
| Job TM off until owner enables | 1 (enabled default false) |
| Preset + member override R/W | 1, 5 |
| Privacy note on Write | 5 |
| Offline match/write cache | 3, 4, 6 |
| Online pull/push | 4, 6, 7 |
| ACL edit needs network | 5 |
| Match personal ∪ job | 3, 6 |
| Dual-write personal + job | 6 |
| Light Memories UI | 5 |
| No deferred stack / soft-warn / glossary | explicitly out |
| Viewer no Write | 1 tests + 5 UI |
| No email attribution | existing `jobTMActor` + UI nick |

## Out of plan (next)

1. Task 13 — deferred TM write stack for shared writable  
2. Soft-warn on confirm over colleague Exact  
3. Model B — attach extra bases  
4. C2 glossary attach (same Memories pattern)

## Execution note

**Next after this plan:** deferred stack (Task 13), then soft-warn, then dual progress finalize (Task 15).
