# Glossary termbase (C1) Implementation Plan

> **For agentic workers:** Execute task-by-task. Checkbox tracking.

**Goal:** Personal glossary per user: IDB + cloud sync (TM pattern), TBX, source highlight, CRUD panel.

**Architecture:** Mirror TM — `glossary_terms` Postgres, `/api/glossary/sync`, client `glossaryIdb` + `glossary/sync.ts`. Match/highlight local. TBX subset for import/export.

**Tech Stack:** Vue 3, IndexedDB, Go+chi+Postgres, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-16-glossary-termbase-design.md`

## Global Constraints

- Termbase ≠ TM; no email in `createdBy`
- Free users get glossary (no plan gate)
- Match stays client-side on IDB cache
- C2 project TB later — keep entry schema stable

## File map

| Create | Role |
|--------|------|
| `src/types/glossary.ts` | `GlossaryTerm` |
| `src/storage/glossaryIdb.ts` | IDB CRUD |
| `src/glossary/match.ts` | find hits / spans |
| `src/glossary/tbx.ts` | TBX import/export |
| `src/glossary/api.ts` | HTTP sync |
| `src/glossary/sync.ts` | pull/push orchestration |
| `src/components/GlossaryPanel.vue` | CRUD UI |
| `api/migrations/007_glossary_terms.sql` | table |
| `api/internal/glossary/*` | unit, store, handlers |
| `tests/glossary/*.test.ts` | match + tbx |

| Modify | Role |
|--------|------|
| `api/internal/httpapi/router.go` + `main.go` | mount routes |
| `src/auth/session.ts` | `syncGlossary` on login |
| `src/components/RichSourceView.vue` | highlight marks |
| `src/pages/EditorPage.vue` | panel + pass terms |
| `src/i18n/locales/{ru,en}.ts` | copy |
| `PLAN.md` | checkboxes |

---

### Task 1: Types + match + IDB
- [x] Done

### Task 2: TBX
- [x] Done

### Task 3: API migration + Go sync
- [x] Done

### Task 4: Client sync + session hook
- [x] Done

### Task 5: UI panel + source highlight + i18n
- [x] Done

### Task 6: PLAN + commit
- [ ] Commit when requested

---
