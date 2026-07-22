# Job hub — TM strip on unbound project card

Date: 2026-07-21  
Status: Implemented (main)  
Related:

- [`2026-07-20-job-tm-attachments-part2-design.md`](./2026-07-20-job-tm-attachments-part2-design.md) — server job attachments
- [`2026-07-20-tm-collection-part1-design.md`](./2026-07-20-tm-collection-part1-design.md) — project strip / collection UX

## Goal

After creating a job, on the **project bind card** (state «Проект пока не привязан…»), show the **same kind of TM strip** as on a normal project row: attach bases via `+`, empty strip = only the plus. Data is **job server attachments**, not a local project (there is none yet).

## Decisions

| Topic | Choice |
|-------|--------|
| Where | Above the unbound hub card in `JobHubInline` (create/import/bind actions stay below) |
| Look | Same visual strip as `ProjectListItem` (`tm-strip`: chips + `+`) |
| Empty | No chips — only `+` |
| With bases | Chips (icon · Ч/З · short name) + hover tip, same as project |
| Data | Server `job_tm_attachments` (owner mutates; members read-only) |
| Local overlay («Мои доп.») | Not in this strip — stays in «Памяти» |
| Bind policy | **Keep layers separate (industry stack):** do **not** copy or overwrite job ↔ project attachments on bind |
| Linked project | Unbound strip **hidden**; project row keeps its own project `tmAttachments` strip |

## UX

```text
[ job header … ]

[ TM strip: (chips…)  + ]     ← only when no linked project
┌─────────────────────────────────────┐
│ Проект пока не привязан. … · RU→EN  │
│ [DOCX] [Empty] [Import]             │
│ [choose local…] [Bind]              │
└─────────────────────────────────────┘
```

- `+` opens pick / bases dialog for **job** attachments (reuse collection pick; attach via job TM API).
- Owner: add / detach / toggle Ч/З.
- Non-owner: chips visible; no `+` / no edits (or disabled), consistent with Job «Памяти».

## Technical approach

Extract shared **`TmAttachmentStrip`** (chips + tip + add) used by:

1. `ProjectListItem` — project `tmAttachments`
2. Unbound `JobHubInline` — mapped from `JobTmAttachment` (`tmBaseId` → display id)

Job-side wiring: `listJobTmAttachmentsApi` / create / patch / delete; open pick + job bases management dialog (thin adapter or reuse patterns from `JobMemoriesPanel` / `ProjectTmBasesDialog`).

## Out of scope

- Merging or prompting on bind (copy project→job or job→project)
- Showing job strip on top of an already linked `ProjectListItem`
- Editor match/write against job attachments
- Local overlay chips in the hub strip
- Soft hint «copy project TMs into job?» when job list is empty

## Success criteria

- [ ] Unbound job card: TM strip above actions; empty = only `+`
- [ ] Owner can attach/detach/toggle job bases from the strip; members see read-only chips
- [ ] After bind: unbound strip gone; project strip unchanged; neither list auto-modified by bind
- [ ] Shared strip component; visual parity with project row
- [ ] Focused tests for unbound strip empty/`+` and owner vs member
