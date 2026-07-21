# Named Local TM Bases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Local Create/Import named TMs, one IDB with `baseId`, editor match ∪ Readable / write → all Writable — per [`2026-07-21-tm-named-bases-design.md`](../specs/2026-07-21-tm-named-bases-design.md).

**Architecture:** Catalog in IndexedDB `tm_bases`. Units stay in `appzac-tm` with `baseId` + index. Access helper returns readable/writable id sets from project (+ job layers). Personal is not implicit.

**Tech Stack:** Vue 3, idb, Vitest, existing TMX import.

## Global Constraints

- One TM IDB; every unit has `baseId`
- Personal not special for match/write
- Write to all Writable attached bases
- No cloud catalog/sync this slice

## File map

| File | Role |
|------|------|
| `src/types/tm.ts` | `baseId` on `TmUnit` |
| `src/types/project.ts` | `ProjectTmAttachmentId = string` |
| `src/tm/tmBasesCatalog.ts` | CRUD catalog + ensure personal |
| `src/storage/tmBasesIdb.ts` | Persist catalog |
| `src/storage/tmIdb.ts` | v2 + `by-base-id`; list/filter/clear by base |
| `src/tm/tmAccess.ts` | readable/writable base id sets |
| `src/pages/EditorPage.vue` | multi-base match/write |
| `src/components/TmCollectionDialog.vue` | Create / Import UI |
| `src/tm/projectAttachments.ts` | catalog from dynamic bases |
| tests | catalog, tmIdb baseId, tmAccess, collection |

---

### Task 1: Types + catalog + tmIdb `baseId`

- Add `baseId` to `TmUnit`; default `PERSONAL_TM_ATTACHMENT_ID` on migrate
- `ProjectTmAttachmentId = string`
- Catalog IDB + `listTmBases` / `createTmBase` / `deleteTmBase` / `ensurePersonalTmBase`
- TM DB v2: index `by-base-id`; `listTmUnits({ baseIds })`, `clearTmUnits(baseId?)`, `getTmBaseStats(baseId)`, put paths set `baseId`
- Tests; commit

### Task 2: Access helper + editor

- `resolveTmBaseAccess` → `{ jobContext, readableBaseIds, writableBaseIds }`
- Deprecate/wrap `resolvePersonalTmAccess` for compatibility or replace call sites
- Editor: load units for readable set; write segment to each writable baseId
- `recordDoneSegmentsInTm` / upsert accept `baseId` (or loop in editor)
- Tests; commit

### Task 3: Collection Create / Import UI + wire catalog

- Browse: Create name, Import TMX (new or into existing)
- Delete named vs personal clear
- Pick uses live catalog
- i18n; tests; commit
