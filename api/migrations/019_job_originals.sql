-- +goose Up
CREATE TABLE IF NOT EXISTS job_originals (
  job_id UUID PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  storage_path TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE IF EXISTS job_originals;
