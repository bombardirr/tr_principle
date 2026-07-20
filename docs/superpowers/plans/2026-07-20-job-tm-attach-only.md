# Job TM attach-only — implementation plan

**Spec:** [`2026-07-20-job-tm-attach-only-design.md`](../specs/2026-07-20-job-tm-attach-only-design.md)

## Phase 0 — Retire Model A (done)

- [x] Remove «ТМ работы» from `JobMemoriesPanel`
- [x] Remove editor match/dual-write to `job_tm`
- [x] Supersede Model A design doc

## Phase 1 — Personal TM attach (next)

- [ ] Migration `job_tm_attachments`
- [ ] Go: CRUD attachments, ACL (member attaches own personal TM first)
- [ ] `JobMemoriesPanel`: list + attach + R/W toggles
- [ ] Editor: match ∪ attached Read; write to attached Write (personal still always)

## Phase 2 — Deferred stack (Task 13)

- [ ] Pending stack for writes to **attached** writable bases only

## Phase 3 — Cross-user / team TM (later)

- [ ] Attach colleague or team TM by ref + ACL
