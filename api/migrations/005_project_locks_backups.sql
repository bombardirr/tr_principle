-- +goose Up
CREATE TABLE IF NOT EXISTS project_locks (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL,
  holder_id TEXT NOT NULL,
  token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, project_id)
);

CREATE INDEX IF NOT EXISTS project_locks_expires ON project_locks (expires_at);

CREATE TABLE IF NOT EXISTS project_backups (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  size_bytes BIGINT NOT NULL,
  storage_path TEXT NOT NULL,
  PRIMARY KEY (user_id, project_id)
);

-- +goose Down
DROP TABLE IF EXISTS project_backups;
DROP TABLE IF EXISTS project_locks;
