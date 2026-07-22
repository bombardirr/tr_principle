# Editor — job TM context (match/write gate)

Date: 2026-07-21  
Status: Implemented (main)  
Related:

- [`2026-07-20-job-tm-attachments-part2-design.md`](./2026-07-20-job-tm-attachments-part2-design.md)
- [`2026-07-21-job-hub-tm-strip-design.md`](./2026-07-21-job-hub-tm-strip-design.md)
- [`2026-07-20-job-tm-attach-only-design.md`](./2026-07-20-job-tm-attach-only-design.md)

## Goal

When the translator opens a project **in job context**, editor match/write respect **job** TM attachments (server shared + local overlay) in addition to **project** attachments. Outside job context, job bases are not used.

## Decisions

| Topic | Choice |
|-------|--------|
| Job context signal | Query `?job=<jobId>` on editor route |
| Open from job hub | Linked project link includes `?job=` |
| Open from projects list | No `job` query → project + personal rules only |
| Invalid query | If `?job=` ≠ `meta.jobId`, ignore job layer |
| Unit pools this slice | Still **one** personal TM unit store |
| Access model (Approach A) | Personal TM readable/writable if **any** applicable layer grants the flag |
| Later | Multi-base unit pools + match union (shareable bases / sync) |

## Access rules (personal TM pool)

Layers that can grant Read/Write on `personal-tm`:

1. **Project** `tmAttachments` (always considered)
2. **Job shared** (`job_tm_attachments` API) — only if job context active
3. **Job local overlay** (`jobAttachments` localStorage) — only if job context active

```
jobContext = query.job is set AND query.job === meta.jobId

canReadPersonal =
  project.personal.canRead
  OR (jobContext AND jobShared.personal.canRead)
  OR (jobContext AND jobLocal.personal.canRead)

canWritePersonal = same with canWrite
```

Match uses personal units iff `canReadPersonal`.  
Confirm / autosave / TM import write iff `canWritePersonal` (same gates as today, with the expanded flag).

## UX / navigation

- `ProjectListItem` inside job hub (`glow` / job-linked): `router-link` → `{ name: 'editor', params: { id }, query: { job: jobId } }`
- Needs `jobId` prop (or equivalent) on the list item when rendered from `JobHubInline`
- Projects page / non-job list: unchanged (no query)

Optional later: small editor chrome hint «Работа» when `jobContext` — not required this slice.

## Out of scope

- Separate unit stores per `tmBaseId`
- Cross-user unit sync for foreign bases
- Export / Clone
- Toggle «work without job TMs» while staying in job URL
- Changing bind merge policy

## Success criteria

- [ ] Editor without `?job=` behaves as today (project attachments only)
- [ ] Editor with matching `?job=` ORs in job shared + local overlay flags for personal TM
- [ ] Hub → editor link includes `?job=`
- [ ] Mismatched `?job=` does not apply job layer
- [ ] Unit tests for access helper; focused editor/hub link coverage where practical
