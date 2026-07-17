-- +goose Up
CREATE TABLE project_sync_state (
  project_id UUID PRIMARY KEY REFERENCES projects (id) ON DELETE CASCADE,
  meta JSONB NOT NULL DEFAULT '{}',
  segments JSONB NOT NULL DEFAULT '[]',
  docx_hash TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE IF EXISTS project_sync_state;
