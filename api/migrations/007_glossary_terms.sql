-- +goose Up
CREATE TABLE IF NOT EXISTS glossary_terms (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id UUID NOT NULL,
  source_lang TEXT NOT NULL,
  target_lang TEXT NOT NULL,
  source_term TEXT NOT NULL,
  target_term TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved',
  note TEXT,
  case_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  created_by TEXT,
  CONSTRAINT glossary_terms_status_check CHECK (status IN ('approved', 'forbidden')),
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS glossary_terms_user_updated ON glossary_terms (user_id, updated_at);

-- +goose Down
DROP TABLE IF EXISTS glossary_terms;
