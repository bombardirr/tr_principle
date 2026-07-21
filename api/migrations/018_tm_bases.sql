-- +goose Up
CREATE TABLE IF NOT EXISTS tm_bases (
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  label TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#5b9fd4',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  PRIMARY KEY (owner_id, id)
);

ALTER TABLE tm_units
  ADD COLUMN IF NOT EXISTS base_id TEXT NOT NULL DEFAULT 'personal-tm';

UPDATE tm_units SET base_id = 'personal-tm' WHERE base_id IS NULL OR base_id = '';

CREATE INDEX IF NOT EXISTS tm_units_user_base_updated
  ON tm_units (user_id, base_id, updated_at);

INSERT INTO tm_bases (owner_id, id, label, color, created_at, updated_at)
SELECT DISTINCT user_id, 'personal-tm', 'Personal TM', '#5b9fd4', now(), now()
FROM tm_units
ON CONFLICT DO NOTHING;

-- +goose Down
DROP INDEX IF EXISTS tm_units_user_base_updated;
ALTER TABLE tm_units DROP COLUMN IF EXISTS base_id;
DROP TABLE IF EXISTS tm_bases;
