-- +goose Up
-- Remove F2.0 co-edit shared-project tables (replaced by jobs model).
DROP TABLE IF EXISTS project_tm_units;
DROP TABLE IF EXISTS project_tm_attachments;
DROP TABLE IF EXISTS project_sync_state;
DROP TABLE IF EXISTS shared_project_locks;
DROP TABLE IF EXISTS project_invites;
DROP TABLE IF EXISTS project_members;
DROP TABLE IF EXISTS projects;
ALTER TABLE project_locks DROP COLUMN IF EXISTS lock_user_id;

-- +goose Down
-- Irreversible data loss; recreate empty schema from 008–010 if needed for local rollback.
CREATE TABLE projects (
  id UUID PRIMARY KEY,
  owner_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_lang TEXT,
  target_lang TEXT,
  meta JSONB NOT NULL DEFAULT '{}',
  docx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE project_members (
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE project_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  created_by UUID NOT NULL REFERENCES users (id),
  expires_at TIMESTAMPTZ,
  max_uses INT,
  uses_count INT NOT NULL DEFAULT 0,
  invited_user_id UUID REFERENCES users (id),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX project_members_user ON project_members (user_id);
CREATE INDEX project_invites_project ON project_invites (project_id);

ALTER TABLE project_locks ADD COLUMN IF NOT EXISTS lock_user_id UUID REFERENCES users (id);

CREATE TABLE IF NOT EXISTS shared_project_locks (
  project_id UUID PRIMARY KEY REFERENCES projects (id) ON DELETE CASCADE,
  holder_user_id UUID NOT NULL REFERENCES users (id),
  holder_id TEXT NOT NULL,
  token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE project_tm_units (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  source_key TEXT NOT NULL,
  source_lang TEXT,
  target_lang TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  created_by TEXT,
  updated_by TEXT,
  context_before TEXT,
  context_after TEXT
);
CREATE INDEX project_tm_units_project_updated ON project_tm_units (project_id, updated_at);

CREATE TABLE project_tm_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('project', 'user')),
  user_id UUID REFERENCES users (id),
  can_read BOOLEAN NOT NULL DEFAULT true,
  can_write BOOLEAN NOT NULL DEFAULT false,
  can_export BOOLEAN NOT NULL DEFAULT false,
  can_clone BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, kind, user_id)
);

CREATE TABLE project_sync_state (
  project_id UUID PRIMARY KEY REFERENCES projects (id) ON DELETE CASCADE,
  meta JSONB NOT NULL DEFAULT '{}',
  segments JSONB NOT NULL DEFAULT '[]',
  docx_hash TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
