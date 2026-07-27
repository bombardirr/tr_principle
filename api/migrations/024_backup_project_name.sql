-- +goose Up
ALTER TABLE project_backups
  ADD COLUMN IF NOT EXISTS project_name TEXT NOT NULL DEFAULT '';

-- +goose Down
ALTER TABLE project_backups DROP COLUMN IF EXISTS project_name;
