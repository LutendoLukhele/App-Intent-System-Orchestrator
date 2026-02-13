-- migrations/003_subscriptions.sql
-- Stripe & RevenueCat Subscription Management Schema

-- Stripe Customers (links Firebase UID to Stripe customer ID)
CREATE TABLE IF NOT EXISTS stripe_customers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,                    -- Firebase UID
  email TEXT NOT NULL,                             -- Email from Firebase Auth
  stripe_customer_id TEXT NOT NULL UNIQUE,         -- From Stripe
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_customers_user_id ON stripe_customers(user_id);
CREATE INDEX IF NOT EXISTS idx_stripe_customers_email ON stripe_customers(email);
CREATE INDEX IF NOT EXISTS idx_stripe_customers_stripe_id ON stripe_customers(stripe_customer_id);

-- Subscriptions (tracks active subscriptions)
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,                           -- Firebase UID
  stripe_customer_id TEXT NOT NULL,                -- From Stripe
  stripe_subscription_id TEXT NOT NULL UNIQUE,     -- Stripe subscription ID
  stripe_product_id TEXT NOT NULL,                 -- Pro, Premium, Enterprise, etc.
  status TEXT NOT NULL,                            -- active, past_due, canceled, trialing
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  canceled_at TIMESTAMPTZ,
  amount_paid INTEGER,                             -- In cents (e.g., 9900 = $99.00)
  currency TEXT DEFAULT 'usd',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, stripe_subscription_id),
  FOREIGN KEY (user_id) REFERENCES stripe_customers(user_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status) WHERE status IN ('active', 'trialing');
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id);

-- RevenueCat Sync Log (audit trail of entitlement updates)
CREATE TABLE IF NOT EXISTS revenueCat_sync_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,                           -- Firebase UID
  action TEXT NOT NULL,                            -- 'grant', 'revoke', 'update'
  entitlement_id TEXT NOT NULL,                    -- e.g., 'pro', 'premium'
  success BOOLEAN DEFAULT false,
  error TEXT,
  request_payload JSONB,
  response_payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revenueCat_sync_user_id ON revenueCat_sync_log(user_id);
CREATE INDEX IF NOT EXISTS idx_revenueCat_sync_created_at ON revenueCat_sync_log(created_at DESC);

-- Stripe Events (webhook audit trail)
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id TEXT PRIMARY KEY,
  stripe_event_id TEXT NOT NULL UNIQUE,            -- From Stripe webhook
  event_type TEXT NOT NULL,                        -- customer.subscription.created, updated, deleted
  user_id TEXT,                                    -- Firebase UID (may be null for new customers)
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT false,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_stripe_id ON stripe_webhook_events(stripe_event_id);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_type ON stripe_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_user_id ON stripe_webhook_events(user_id);
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_processed ON stripe_webhook_events(processed);
