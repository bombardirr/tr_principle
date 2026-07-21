# Job Hub Unbound TM Strip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a project-like TM strip (empty = only `+`) above the unbound job project card, wired to server job attachments — per [`2026-07-21-job-hub-tm-strip-design.md`](../specs/2026-07-21-job-hub-tm-strip-design.md).

**Architecture:** Extract `TmAttachmentStrip` (chips + tip + add). `ProjectListItem` keeps project data; unbound `JobHubInline` loads/mutates job attachments via API. Bind does not merge lists. `JobTmBasesDialog` mirrors project bases dialog for job rows.

**Tech Stack:** Vue 3 + TypeScript, Vitest, existing `tmAttachmentsApi`, collection pick dialog.

## Global Constraints

- Empty strip = only `+`; chips when attachments exist.
- Data = server job attachments; no local overlay on hub strip.
- Owner mutates; non-owner read-only (no `+` / no dialog edits).
- Bind must not copy/overwrite job ↔ project attachments.
- Strip only when `!linkedProject`; linked project keeps its own strip.
- Visual parity with project row strip.

## File map

| File | Responsibility |
|------|----------------|
| `src/components/TmAttachmentStrip.vue` | Shared chips + tip + `+` |
| `src/components/ProjectListItem.vue` | Use strip; keep project attach flow |
| `src/components/JobTmBasesDialog.vue` | Manage job shared attachments (Ч/З / − / +) |
| `src/components/JobHubInline.vue` | Unbound strip + load/API + dialogs |
| `tests/components/JobHubTmStrip.test.ts` | Empty/`+`, owner vs member |

---

### Task 1: Extract `TmAttachmentStrip`

**Files:**
- Create: `src/components/TmAttachmentStrip.vue`
- Modify: `src/components/ProjectListItem.vue`

**Interfaces:**
- Props: `items: { id: string; canRead: boolean; canWrite: boolean }[]`, `disabled?: boolean`, `showAdd?: boolean` (default true), `busy?: boolean`, tip stats optional for personal
- Emit: `add` (click `+`)

- [ ] **Step 1:** Move strip + tip markup/styles from `ProjectListItem` into `TmAttachmentStrip`
- [ ] **Step 2:** Wire `ProjectListItem` to `<TmAttachmentStrip :items="tmAttachments" @add="openBases" />`
- [ ] **Step 3:** `npx vitest run` relevant project list tests if any; manual smoke not required
- [ ] **Step 4:** Commit `refactor: extract TmAttachmentStrip component`

---

### Task 2: `JobTmBasesDialog` + hub wiring

**Files:**
- Create: `src/components/JobTmBasesDialog.vue`
- Modify: `src/components/JobHubInline.vue`
- Create: `tests/components/JobHubTmStrip.test.ts`

**Behavior:**
- On unbound card: strip above muted text; load `listJobTmAttachmentsApi(jobId)` when job loads / jobId changes (clear on change)
- Empty → only `+`; `+` or empty openBases → pick if empty else bases dialog
- Owner: create/patch/delete via API; member: `showAdd=false`, dialog read-only or don’t open manage
- Map `JobTmAttachment` → strip items via `{ id: tmBaseId, canRead, canWrite }` (key chips by attachment UUID in dialog)
- Do not change `bind` / create / import paths regarding attachments

- [ ] **Step 1:** Failing test — unbound mount with mocked API empty → `[data-testid="job-hub-tm-add"]` present; member → add hidden
- [ ] **Step 2:** Implement dialog + hub wiring
- [ ] **Step 3:** Tests pass
- [ ] **Step 4:** Commit `feat: job hub TM strip for unbound project card`

---

### Task 3: Verify

- [ ] `npx vitest run tests/components/JobHubTmStrip.test.ts` (+ any ProjectListItem tests)
- [ ] Confirm bind paths untouched for attachment merge
- [ ] Commit only if leftovers
