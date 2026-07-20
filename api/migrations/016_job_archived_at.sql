-- +goose Up
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS jobs_archived_at ON jobs (archived_at);

-- +goose Down
DROP INDEX IF EXISTS jobs_archived_at;
ALTER TABLE jobs DROP COLUMN IF EXISTS archived_at;
