-- migrations/001_cortex.sql
-- Cortex Event Automation System Schema

-- Connections
CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  enabled BOOLEAN DEFAULT true,
  last_poll_at TIMESTAMPTZ,
  error_count INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_connections_poll ON connections(enabled, last_poll_at) WHERE enabled = true;

-- Units
CREATE TABLE IF NOT EXISTS units (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  raw_when TEXT NOT NULL,
  raw_if TEXT,
  raw_then TEXT NOT NULL,
  compiled_when JSONB NOT NULL,
  compiled_if JSONB DEFAULT '[]',
  compiled_then JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  trigger_source TEXT,
  trigger_event TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  run_count INTEGER DEFAULT 0,
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT
);

CREATE INDEX IF NOT EXISTS idx_units_owner ON units(owner_id);
CREATE INDEX IF NOT EXISTS idx_units_trigger ON units(trigger_source, trigger_event) WHERE status = 'active';

-- Runs
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  current_step INTEGER DEFAULT 0,
  context JSONB DEFAULT '{}',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  resume_at TIMESTAMPTZ,
  error TEXT,
  original_event_payload JSONB
);

CREATE INDEX IF NOT EXISTS idx_runs_unit ON runs(unit_id);
CREATE INDEX IF NOT EXISTS idx_runs_user ON runs(user_id, started_at DESC);

-- Run steps
CREATE TABLE IF NOT EXISTS run_steps (
  id SERIAL PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL,
  action_type TEXT NOT NULL,
  action_config JSONB NOT NULL,
  status TEXT NOT NULL,
  result JSONB,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE(run_id, step_index)
);

-- Update unit stats trigger
CREATE OR REPLACE FUNCTION update_unit_stats() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('success', 'failed') AND OLD.status != NEW.status THEN
    UPDATE units SET run_count = run_count + 1, last_run_at = NEW.completed_at, last_run_status = NEW.status, updated_at = NOW() WHERE id = NEW.unit_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_unit_stats ON runs;
CREATE TRIGGER trigger_update_unit_stats AFTER UPDATE ON runs FOR EACH ROW EXECUTE FUNCTION update_unit_stats();
