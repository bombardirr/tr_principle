-- +goose Up
CREATE TABLE telegram_link_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX telegram_link_tokens_user_idx ON telegram_link_tokens (user_id);
CREATE INDEX telegram_link_tokens_expires_idx ON telegram_link_tokens (expires_at);

CREATE TABLE password_reset_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX password_reset_codes_user_idx ON password_reset_codes (user_id);
CREATE INDEX password_reset_codes_expires_idx ON password_reset_codes (expires_at);

-- +goose Down
DROP TABLE IF EXISTS password_reset_codes;
DROP TABLE IF EXISTS telegram_link_tokens;
