# F2.0 co-edit removed (2026-07-17)

Co-edit bilingual sync/locks/presence and project-scoped TM attachments were **removed** in favor of the shared-work **jobs** model.

## Removed from app code

- Package `api/internal/collab`
- Routes: `POST/GET /api/projects`, members/invites, sync, presence, project TM
- Client: `collabApi`, `collabSync`, `projectTmApi`, members/TM panels, invite accept page
- Flag `meta.cloudShared`

## Kept

- Solo `project_locks` + cloud backup (`/api/projects/{id}/lock|backup`)
- F1 `ShareProjectDialog` (`.tcat.zip` handoff)
- Personal TM / glossary sync

## DB

Migration `011_drop_coedit.sql` drops F2.0 tables created by `008`–`010`. Historical migration files remain for goose history.

New work uses `/api/jobs` only (see shared-work jobs plan).
