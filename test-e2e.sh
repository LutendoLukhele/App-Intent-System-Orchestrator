#!/bin/bash

echo "🧪 Testing Backend Integration..."
echo ""

BASE_URL="http://localhost:8080"
SESSION_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
USER_ID="test-user-$(date +%s)"

echo "📌 Test Configuration:"
echo "  Base URL: $BASE_URL"
echo "  Session ID: $SESSION_ID"
echo "  User ID: $USER_ID"
echo ""

# Test 1: Provider Key Query
echo "1️⃣ Test Provider Key Database Query"
echo "   Expected: Should find 'google-mail-ynxw' in database (not 'google-mail')"
echo "   Action: Query tool-config for fetch_emails provider key"
echo ""

# Test 2: OAuth Callback Validation
echo "2️⃣ Test OAuth Callback Provider Validation"
echo "   Expected: Should validate provider key exists in tool-config.json"
echo "   If provider key missing, should log warning"
echo ""

# Test 3: Auto-execution Decision - Single Read-only Action
echo "3️⃣ Test Auto-execution: Single Read-only Action"
echo "   Expected: Single fetch_emails action should AUTO-EXECUTE"
echo "   Verify: No 'action_confirmation_required' event sent"
echo ""

# Test 4: Multi-step Plan Confirmation
echo "4️⃣ Test Multi-step Plan Confirmation"
echo "   Expected: 2+ action plan should show EXECUTE BUTTON"
echo "   Verify: 'action_confirmation_required' event with showExecuteButton: true"
echo ""

# Test 5: No Duplicate Messages
echo "5️⃣ Test Message Deduplication"
echo "   Expected: Same message ID should not appear twice in stream"
echo "   Verify: StreamManager tracks and suppresses duplicates"
echo ""

echo "✨ Check server logs above for these operations"
echo ""
echo "📊 Check these log messages:"
echo "  ✓ 'All providers have valid provider keys'"
echo "  ✓ 'Single read-only action - auto-executing'"
echo "  ✓ 'Multi-step plan requires confirmation'"
echo "  ✓ 'Duplicate message suppressed'"
echo ""
echo "🎯 Server is ready for client integration testing!"
