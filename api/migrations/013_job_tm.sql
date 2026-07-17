-- +goose Up
CREATE TABLE job_tm_units (
  job_id UUID NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  id UUID NOT NULL,
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
  context_after TEXT,
  PRIMARY KEY (job_id, id)
);

CREATE INDEX job_tm_units_job_updated ON job_tm_units (job_id, updated_at);
CREATE INDEX job_tm_units_job_source_key ON job_tm_units (job_id, source_key);

CREATE TABLE job_resource_presets (
  job_id UUID NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  can_read BOOLEAN NOT NULL DEFAULT true,
  can_write BOOLEAN NOT NULL DEFAULT true,
  can_export BOOLEAN NOT NULL DEFAULT false,
  can_clone BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, kind)
);

CREATE TABLE job_member_resource_overrides (
  job_id UUID NOT NULL,
  user_id UUID NOT NULL,
  kind TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  can_read BOOLEAN,
  can_write BOOLEAN,
  can_export BOOLEAN,
  can_clone BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, user_id, kind),
  FOREIGN KEY (job_id, user_id)
    REFERENCES job_members (job_id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (job_id, kind)
    REFERENCES job_resource_presets (job_id, kind) ON DELETE CASCADE
);

INSERT INTO job_resource_presets (job_id, kind)
SELECT id, 'job_tm' FROM jobs
ON CONFLICT (job_id, kind) DO NOTHING;

-- +goose Down
DROP TABLE IF EXISTS job_member_resource_overrides;
DROP TABLE IF EXISTS job_resource_presets;
DROP TABLE IF EXISTS job_tm_units;
