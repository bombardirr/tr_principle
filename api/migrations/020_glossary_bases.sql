-- +goose Up
CREATE TABLE IF NOT EXISTS glossary_bases (
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  label TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#5b9fd4',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  PRIMARY KEY (owner_id, id)
);

ALTER TABLE glossary_terms
  ADD COLUMN IF NOT EXISTS base_id TEXT NOT NULL DEFAULT 'personal-glossary';

UPDATE glossary_terms SET base_id = 'personal-glossary'
  WHERE base_id IS NULL OR base_id = '';

CREATE INDEX IF NOT EXISTS glossary_terms_user_base_updated
  ON glossary_terms (user_id, base_id, updated_at);

INSERT INTO glossary_bases (owner_id, id, label, color, created_at, updated_at)
SELECT DISTINCT user_id, 'personal-glossary', 'Personal glossary', '#5b9fd4', now(), now()
FROM glossary_terms
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS job_glossary_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  glossary_base_id TEXT NOT NULL,
  can_read BOOLEAN NOT NULL DEFAULT true,
  can_write BOOLEAN NOT NULL DEFAULT false,
  can_export BOOLEAN NOT NULL DEFAULT false,
  can_clone BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, glossary_base_id)
);

CREATE INDEX IF NOT EXISTS job_glossary_attachments_job_id ON job_glossary_attachments (job_id);

-- +goose Down
DROP TABLE IF EXISTS job_glossary_attachments;
DROP INDEX IF EXISTS glossary_terms_user_base_updated;
ALTER TABLE glossary_terms DROP COLUMN IF EXISTS base_id;
DROP TABLE IF EXISTS glossary_bases;
