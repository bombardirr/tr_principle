-- +goose Up
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
  user_id UUID REFERENCES users (id), -- required when kind=user
  can_read BOOLEAN NOT NULL DEFAULT true,
  can_write BOOLEAN NOT NULL DEFAULT false,
  can_export BOOLEAN NOT NULL DEFAULT false,
  can_clone BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, kind, user_id)
);

-- +goose Down
DROP TABLE IF EXISTS project_tm_attachments;
DROP TABLE IF EXISTS project_tm_units;
