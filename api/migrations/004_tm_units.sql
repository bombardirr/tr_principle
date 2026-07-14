-- +goose Up
CREATE TABLE IF NOT EXISTS tm_units (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id UUID NOT NULL,
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  source_key TEXT NOT NULL,
  source_lang TEXT,
  target_lang TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  project_id TEXT,
  created_by TEXT,
  updated_by TEXT,
  context_before TEXT,
  context_after TEXT,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS tm_units_user_updated ON tm_units (user_id, updated_at);
CREATE INDEX IF NOT EXISTS tm_units_user_source_key ON tm_units (user_id, source_key);

-- +goose Down
DROP TABLE IF EXISTS tm_units;
