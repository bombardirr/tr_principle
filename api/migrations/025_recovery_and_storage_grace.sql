-- +goose Up
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS recovery_code_hash TEXT;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS storage_grace_started_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS subscriptions_storage_grace_idx
  ON subscriptions (storage_grace_started_at)
  WHERE storage_grace_started_at IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS subscriptions_storage_grace_idx;
ALTER TABLE subscriptions DROP COLUMN IF EXISTS storage_grace_started_at;
ALTER TABLE users DROP COLUMN IF EXISTS recovery_code_hash;
