-- +goose Up
CREATE TABLE subscriptions (
  user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  current_period_end TIMESTAMPTZ,
  provider TEXT,
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT subscriptions_plan_check CHECK (plan IN ('free', 'pro')),
  CONSTRAINT subscriptions_status_check CHECK (
    status IN ('active', 'trialing', 'past_due', 'canceled', 'inactive')
  )
);

INSERT INTO subscriptions (user_id, plan, status)
SELECT id, 'free', 'active'
FROM users
ON CONFLICT (user_id) DO NOTHING;

-- +goose Down
DROP TABLE IF EXISTS subscriptions;
