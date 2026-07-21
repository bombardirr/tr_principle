# Job TM Export / Clone ACL UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owner toggles E/C on job shared TM attachments; members with flags export TMX or clone units into an owned base — per [`2026-07-22-job-tm-export-clone-acl-design.md`](../specs/2026-07-22-job-tm-export-clone-acl-design.md).

**Architecture:** Client-only IO over synced IDB units. ACL from server `JobTmAttachment` flags. Shared local base id via `sharedTmLocalId(ownerId, tmBaseId)`. No new server endpoints.

**Tech Stack:** Vue 3, existing `exportTmx` / `importTmUnits` / `syncTmBase` / `patchJobTmAttachment`, Vitest, vue-i18n.

## Global Constraints

- Job shared attachments only (not project; not local overlay)
- Client IO + ACL from server list (no export/clone API)
- Clone target: picker of **owned** bases (Personal or named)
- Hide Export/Clone if `!canRead` or missing flag
- Editor bulk TMX unchanged
- Defaults on attach unchanged: R on, W/E/C off

## File map

| File | Role |
|------|------|
| `src/tm/jobTmIo.ts` | `ensureSharedUnits`, `exportSharedTmAsTmx`, `cloneSharedTmToOwnedBase` |
| `src/components/JobMemoriesPanel.vue` | E/C toggles + Export/Clone + clone picker |
| `src/components/JobTmBasesDialog.vue` | Owner E/C toggles |
| `src/i18n/locales/{en,ru}.ts` | Perm + button + dialog + empty copy |
| `tests/tm/jobTmIo.test.ts` | Helper unit tests |
| `tests/components/JobMemoriesPanel.test.ts` | Flag visibility + clone/export wiring |

---

### Task 1: IO helpers (+ tests)

**Files:**
- Create: `src/tm/jobTmIo.ts`
- Test: `tests/tm/jobTmIo.test.ts`

**Interfaces:**
- Consumes: `listTmUnits`, `importTmUnits`, `exportTmx`, `syncTmBase`, `sharedTmLocalId`, `markTmDirty`, `downloadBlob`
- Produces:
  - `ensureSharedUnitsForJob({ jobId, ownerId, tmBaseId }) → TmUnit[]`
  - `exportSharedJobTm({ jobId, ownerId, tmBaseId, label?, sourceLang?, targetLang? }) → { count }`
  - `cloneSharedJobTm({ jobId, ownerId, tmBaseId, targetBaseId }) → { count }`

- [ ] **Step 1: Write failing tests** in `tests/tm/jobTmIo.test.ts`

Mock `@/storage/tmIdb`, `@/tm/sync`, `@/tm/tmx`, `@/docx/exportDocx`.

Cases:
1. `exportSharedJobTm` — empty then after sync has units → calls `syncTmBase(tmBaseId, { jobId })`, `listTmUnits({ baseIds: [sharedTmLocalId(...)] })`, `downloadBlob`, `count === 1`
2. `cloneSharedJobTm` — copies with new ids, `baseId === targetBaseId`, `markTmDirty` called
3. Export still empty after sync → `count === 0`, no `downloadBlob`

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test -- --pool=threads tests/tm/jobTmIo.test.ts
```

- [ ] **Step 3: Implement `src/tm/jobTmIo.ts`**

```ts
import { downloadBlob } from '@/docx/exportDocx'
import { importTmUnits, listTmUnits } from '@/storage/tmIdb'
import { sharedTmLocalId } from '@/storage/tmBasesIdb'
import { markTmDirty, syncTmBase } from '@/tm/sync'
import { exportTmx } from '@/tm/tmx'
import type { TmUnit } from '@/types/tm'

export async function ensureSharedUnitsForJob(opts: {
  jobId: string
  ownerId: string
  tmBaseId: string
}): Promise<TmUnit[]> {
  const localId = sharedTmLocalId(opts.ownerId, opts.tmBaseId)
  let units = await listTmUnits({ baseIds: [localId] })
  if (units.length) return units
  await syncTmBase(opts.tmBaseId, { jobId: opts.jobId })
  return listTmUnits({ baseIds: [localId] })
}

export async function exportSharedJobTm(opts: {
  jobId: string
  ownerId: string
  tmBaseId: string
  label?: string
  sourceLang?: string
  targetLang?: string
}): Promise<{ count: number }> {
  const units = await ensureSharedUnitsForJob(opts)
  if (!units.length) return { count: 0 }
  const xml = exportTmx(units, {
    sourceLang: opts.sourceLang,
    targetLang: opts.targetLang,
  })
  const safe = (opts.label ?? opts.tmBaseId).replace(/[^\w.-]+/g, '_').slice(0, 64)
  downloadBlob(new Blob([xml], { type: 'application/xml' }), `${safe || 'tm'}.tmx`)
  return { count: units.length }
}

export async function cloneSharedJobTm(opts: {
  jobId: string
  ownerId: string
  tmBaseId: string
  targetBaseId: string
}): Promise<{ count: number }> {
  const units = await ensureSharedUnitsForJob(opts)
  if (!units.length) return { count: 0 }
  const copies = units.map(u => ({
    ...u,
    id: crypto.randomUUID(),
    baseId: opts.targetBaseId,
    deletedAt: null as string | null,
    updatedAt: new Date().toISOString(),
  }))
  const { ids } = await importTmUnits(copies, { baseId: opts.targetBaseId })
  markTmDirty(...ids)
  return { count: ids.length }
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npm test -- --pool=threads tests/tm/jobTmIo.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/tm/jobTmIo.ts tests/tm/jobTmIo.test.ts
git commit -m "feat: client helpers for job TM export and clone"
```

---

### Task 2: UI flags + Export/Clone actions + i18n

**Files:**
- Modify: `src/components/JobMemoriesPanel.vue`
- Modify: `src/components/JobTmBasesDialog.vue`
- Modify: `src/i18n/locales/en.ts`, `src/i18n/locales/ru.ts`
- Test: `tests/components/JobMemoriesPanel.test.ts`

**Interfaces:**
- Consumes: Task 1 helpers; `patchJobTmAttachment` (`canExport`/`canClone` already on `PatchJobTmAttachmentInput`)
- Requires `attachment.ownerId` for helpers (from cloud-share list)

- [ ] **Step 1: i18n** — add keys under `projects` (and short job notices if needed):

| Key | EN | RU |
|-----|----|----|
| `tmPermExport` / `Short` | Export / E | Экспорт / Э |
| `tmPermClone` / `Short` | Clone / C | Клон / К |
| `tmExportTmx` | Export TMX | Экспорт TMX |
| `tmClone` | Clone… | Клонировать… |
| `tmCloneTitle` | Clone into your TM | Клонировать в вашу ТМ |
| `tmCloneTarget` | Target base | Целевая база |
| `tmCloneConfirm` / `Cancel` | Clone / Cancel | Клонировать / Отмена |
| `tmIoEmpty` | No units in this base yet | В этой базе пока нет пар |
| `tmCloned` / `tmExported` | Cloned/Exported {count} units | Склонировано/Экспортировано пар: {count} |

- [ ] **Step 2: Owner E/C toggles**

Widen `toggleShared` / `JobTmBasesDialog.togglePermission` to `'canRead' | 'canWrite' | 'canExport' | 'canClone'`. Add E/C checkboxes beside R/W on shared cards (owner edits; others disabled).

- [ ] **Step 3: Member Export / Clone**

Show Export when `canRead && canExport && ownerId`; Clone when `canRead && canClone && ownerId`.

```ts
await exportSharedJobTm({ jobId, ownerId, tmBaseId, label })
// clone: dialog → listTmBases() where sharedOnly !== true → cloneSharedJobTm({ targetBaseId })
```

Empty count → show `tmIoEmpty` via existing error/notice channel.

- [ ] **Step 4: Tests in `JobMemoriesPanel.test.ts`**

- Owner toggle E/C → `patchJobTmAttachment(..., { canExport: true })`
- Member no flags → no Export/Clone buttons
- Member with flags → buttons; click Export mocks `jobTmIo`
- Local overlay still R/W only

- [ ] **Step 5: Run**

```bash
npm test -- --pool=threads tests/components/JobMemoriesPanel.test.ts tests/tm/jobTmIo.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/components/JobMemoriesPanel.vue src/components/JobTmBasesDialog.vue src/i18n/locales/en.ts src/i18n/locales/ru.ts tests/components/JobMemoriesPanel.test.ts
git commit -m "feat: job TM export/clone ACL toggles and actions"
```

---

## Spec coverage

| Criterion | Task |
|-----------|------|
| Owner toggle E/C via PATCH | 2 |
| Hide actions without flags / Read | 2 |
| Export TMX | 1+2 |
| Clone to owned picker | 1+2 |
| Empty after sync | 1+2 |
| Local overlay unchanged | 2 |
| Helper tests | 1 |
