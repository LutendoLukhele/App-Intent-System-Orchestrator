# Sync Tests

These tests verify that Nango sync implementations work correctly.

## Prerequisites

1. **Nango CLI** installed:
   ```bash
   npm install -g nango
   ```

2. **Valid connections** configured in Nango dashboard for:
   - google-mail
   - google-calendar
   - salesforce-2

3. **Test connection IDs** set in environment:
   ```bash
   export NANGO_TEST_GMAIL_CONNECTION="your-gmail-connection-id"
   export NANGO_TEST_CALENDAR_CONNECTION="your-calendar-connection-id"
   export NANGO_TEST_SALESFORCE_CONNECTION="your-salesforce-connection-id"
   ```

## Running Sync Tests

### Dry Run (No Data Changed)
```bash
# Test Gmail sync
cd nango-integrations/google-mail
nango dry-run --sync emails --connection-id=$NANGO_TEST_GMAIL_CONNECTION

# Test Calendar sync
cd nango-integrations/google-calendar
nango dry-run --sync events --connection-id=$NANGO_TEST_CALENDAR_CONNECTION

# Test Salesforce sync
cd nango-integrations/salesforce
nango dry-run --sync leads --connection-id=$NANGO_TEST_SALESFORCE_CONNECTION
```

### Full Test Suite
```bash
npm run test:syncs
```

## What These Tests Verify

1. ✅ Sync completes without errors
2. ✅ Data is normalized correctly
3. ✅ Incremental sync works (uses history/sync tokens)
4. ✅ Performance is acceptable (<30s for initial sync)
5. ✅ Required fields are present in all records
6. ✅ Semantic classification works (Gmail only)

## Adding New Sync Tests

1. Create sync script in `nango-integrations/<provider>/syncs/<name>.ts`
2. Add model definition to `.nango/nango.yaml`
3. Create test file `tests/syncs/<provider>-<sync>.test.ts`
4. Add test to package.json `test:syncs` script
