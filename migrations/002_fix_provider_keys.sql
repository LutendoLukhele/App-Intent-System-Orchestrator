-- migrations/002_fix_provider_keys.sql
-- Fix provider config keys to match tool-config.json

-- BACKUP FIRST: Run this before applying migration
-- psql $DATABASE_URL -c "COPY connections TO STDOUT" > connections_backup_$(date +%Y%m%d_%H%M%S).sql

-- Update existing connections to use correct provider config keys
UPDATE connections
SET provider = 'google-mail-ynxw'
WHERE provider IN ('google-mail', 'gmail');

-- Log the changes
DO $$
DECLARE
  updated_count integer;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % connections from google-mail/gmail to google-mail-ynxw', updated_count;
END $$;

-- Add index for faster provider lookups (if not exists)
CREATE INDEX IF NOT EXISTS idx_connections_user_provider
ON connections(user_id, provider);

-- Verify no orphaned connections with invalid provider keys
DO $$
DECLARE
  orphaned_count integer;
BEGIN
  SELECT COUNT(*) INTO orphaned_count
  FROM connections
  WHERE provider NOT IN (
    'google-mail-ynxw',
    'google-calendar',
    'salesforce-2',
    'outlook',
    'notion'
  );

  IF orphaned_count > 0 THEN
    RAISE WARNING '% connections found with unrecognized provider keys', orphaned_count;

    -- Show the orphaned connections for manual review
    RAISE NOTICE 'Orphaned connections:';
    FOR rec IN
      SELECT user_id, provider, connection_id, created_at
      FROM connections
      WHERE provider NOT IN (
        'google-mail-ynxw',
        'google-calendar',
        'salesforce-2',
        'outlook',
        'notion'
      )
    LOOP
      RAISE NOTICE 'user_id: %, provider: %, connection_id: %, created_at: %',
        rec.user_id, rec.provider, rec.connection_id, rec.created_at;
    END LOOP;
  ELSE
    RAISE NOTICE 'All connections have valid provider keys';
  END IF;
END $$;

-- Show final state
SELECT
  provider,
  COUNT(*) as connection_count,
  COUNT(DISTINCT user_id) as user_count
FROM connections
GROUP BY provider
ORDER BY provider;
