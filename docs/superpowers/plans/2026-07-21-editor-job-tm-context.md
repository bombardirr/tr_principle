# Editor Job TM Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or implement inline task-by-task.

**Goal:** Gate personal TM match/write with job shared + local overlay when `?job=` matches — per [`2026-07-21-editor-job-tm-context-design.md`](../specs/2026-07-21-editor-job-tm-context-design.md).

**Architecture:** Pure helper `resolvePersonalTmAccess`; EditorPage reads `route.query.job`; hub `ProjectListItem` links with `query.job`.

## Global Constraints

- Job layer only if `query.job === meta.jobId`
- Without query: project flags only
- OR across project / job shared / job local for personal-tm
- No multi-pool units this slice

---

### Task 1: Access helper + tests

- Create `src/tm/personalTmAccess.ts`
- Create `tests/tm/personalTmAccess.test.ts`
- Commit

### Task 2: Editor + hub link

- Modify `EditorPage.vue` to use helper + load job attachments when in context
- Modify `ProjectListItem.vue` optional `jobId` → editor query
- Modify `JobHubInline.vue` pass `:job-id="jobId"`
- Tests; commit
