-- +goose Up
CREATE TABLE jobs (
  id UUID PRIMARY KEY,
  owner_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source_lang TEXT,
  target_lang TEXT,
  source_filename TEXT,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE job_members (
  job_id UUID NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'translator', 'viewer')),
  local_project_id UUID,
  part_done BOOLEAN NOT NULL DEFAULT false,
  progress_done INT NOT NULL DEFAULT 0,
  progress_total INT NOT NULL DEFAULT 0,
  last_active_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, user_id)
);

CREATE TABLE job_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('translator', 'viewer')),
  created_by UUID NOT NULL REFERENCES users (id),
  expires_at TIMESTAMPTZ,
  max_uses INT,
  uses_count INT NOT NULL DEFAULT 0,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX job_members_user ON job_members (user_id);
CREATE INDEX job_invites_job ON job_invites (job_id);

-- +goose Down
DROP TABLE IF EXISTS job_invites;
DROP TABLE IF EXISTS job_members;
DROP TABLE IF EXISTS jobs;
