-- +goose Up
ALTER TABLE job_resource_presets
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT false;

UPDATE job_resource_presets SET enabled = false WHERE kind = 'job_tm';

-- +goose Down
ALTER TABLE job_resource_presets DROP COLUMN IF EXISTS enabled;
