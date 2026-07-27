-- +goose Up
CREATE TABLE license_keys (
  key_hash TEXT PRIMARY KEY,
  key_hint TEXT NOT NULL DEFAULT '',
  sku TEXT NOT NULL,
  duration_days INT NOT NULL CHECK (duration_days > 0),
  status TEXT NOT NULL DEFAULT 'unused'
    CHECK (status IN ('unused', 'redeemed', 'revoked')),
  note TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES users (id) ON DELETE SET NULL,
  redeemed_by UUID REFERENCES users (id) ON DELETE SET NULL,
  redeemed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT license_keys_redeemed_check CHECK (
    (status = 'redeemed' AND redeemed_by IS NOT NULL AND redeemed_at IS NOT NULL)
    OR (status <> 'redeemed')
  )
);

CREATE INDEX license_keys_status_idx ON license_keys (status);
CREATE INDEX license_keys_created_at_idx ON license_keys (created_at DESC);

-- +goose Down
DROP TABLE IF EXISTS license_keys;
