# Job TM — attach-only model (no shared pool)

Date: 2026-07-20  
Status: Implemented (main)  
Supersedes: [`2026-07-20-job-tm-attach-design.md`](./2026-07-20-job-tm-attach-design.md) Model A («ТМ работы»)

## Decision

| Before (Model A) | After (attach-only) |
|------------------|---------------------|
| One shared `job_tm` pool per job | **No** shared pool |
| «ТМ работы» toggle in «Памяти» | **Прикреплённые** базы с Read/Write |
| Dual-write personal + job TM | Write only to **personal** + **attached** bases with Write |

Same rules as [`2026-07-17-group-collaboration-design.md`](./2026-07-17-group-collaboration-design.md) TM attach:

- **Личная ТМ** — всегда своя, не «течёт» в работу без явного действия.
- **Прикреплённые ТМ** — пользователь (или владелец для пресета) явно подключает базы к работе.
- Match = личная ∪ все прикреплённые с **Read**.
- Confirm/autosave → личная (всегда) + прикреплённые с **Write**.
- Никакой отдельной сущности «общая ТМ».

## MVP attach scope (next slices)

1. **Personal cloud TM attach** — «моя облачная ТМ» как первая прикрепляемая база (opt-in Read/Write на эту работу).
2. **Cross-user attach** — позже: чужая личная / корпоративная база по ACL (Model B из старого спека).
3. **Deferred write stack (Task 13)** — только для прикреплённых с Write, не для «общего пула».

## Schema direction

- **Keep** `job_tm_units` / preset tables in DB for now (no destructive migration); product path **disabled**.
- **Add** `job_tm_attachments` (job_id, tm_scope, tm_owner_user_id?, label, can_read, can_write, can_export, can_clone, created_by, …) — mirror group-collaboration attach model adapted to jobs.
- Sync: attached personal TM uses existing per-user cloud TM sync; no job-scoped unit store for MVP attach.

## UI — «Памяти»

```text
Памяти
┌──────────────────────────────────────────┐
│ Личная ТМ     всегда · только вы         │
│ Прикреплённые ТМ                         │
│   [+ Прикрепить…]  или список + R/W      │
└──────────────────────────────────────────┘
```

No «ТМ работы» row.

## Out of scope

- Reviving `job_tm` as product concept
- Task 13 before attach list works for at least personal attach
