#!/usr/bin/env bash

###############################################################################
# HEADLESS TESTING - QUICK REFERENCE CARD
# Copy & paste commands for different testing scenarios
###############################################################################

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}HEADLESS TESTING - QUICK REFERENCE CARD${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

# ==========================================================================
# SECTION 1: SETUP
# ==========================================================================
echo -e "${GREEN}1. SETUP${NC}"
echo "   First time only:"
echo "   $ bash tests/setup-headless-tests.sh"
echo ""

# ==========================================================================
# SECTION 2: START SERVER
# ==========================================================================
echo -e "${GREEN}2. START SERVER${NC}"
echo "   In Terminal 1:"
echo "   $ npm run dev"
echo "   (Watch for: 'Server listening on port 3000')"
echo ""

# ==========================================================================
# SECTION 3: SIMPLE TESTS
# ==========================================================================
echo -e "${GREEN}3. SIMPLE TESTS${NC}"
echo ""
echo "   A. Run all E2E tests:"
echo "   $ npm test tests/headless-e2e.test.ts"
echo ""
echo "   B. Run single example:"
echo "   $ npx ts-node tests/headless-examples.ts"
echo ""
echo "   C. Run with watch mode:"
echo "   $ npm test -- --watch tests/headless-e2e.test.ts"
echo ""

# ==========================================================================
# SECTION 4: LOAD TESTING
# ==========================================================================
echo -e "${GREEN}4. LOAD TESTING${NC}"
echo ""
echo "   A. Basic load test (5 users, 10 requests):"
echo "   $ bash tests/headless-load-test.sh 5 10"
echo ""
echo "   B. Save results to JSON:"
echo "   $ bash tests/headless-load-test.sh 5 10 5 results.json"
echo ""
echo "   C. Larger load test (100 users, 5 requests):"
echo "   $ bash tests/headless-load-test.sh 100 5 5 large-load.json"
echo ""
echo "   D. View results:"
echo "   $ cat results.json | jq '.metrics'"
echo ""

# ==========================================================================
# SECTION 5: CUSTOM TESTS
# ==========================================================================
echo -e "${GREEN}5. CUSTOM TESTS (Copy & Modify)${NC}"
echo ""
echo "   A. Single user test:"
echo "   cat > my-test.ts << 'EOF'"
echo "   import { HeadlessWSClient } from './tests/headless-ws-client';"
echo "   const client = new HeadlessWSClient({"
echo "       wsUrl: 'ws://localhost:3000',"
echo "       userId: 'my-test-user',"
echo "   });"
echo "   await client.connect();"
echo "   const res = await client.sendUserMessage('Show my emails');"
echo "   console.log(res);"
echo "   EOF"
echo "   npx ts-node my-test.ts"
echo ""

# ==========================================================================
# SECTION 6: PERFORMANCE MONITORING
# ==========================================================================
echo -e "${GREEN}6. PERFORMANCE MONITORING${NC}"
echo ""
echo "   A. Check P95 latency:"
echo "   $ bash tests/headless-load-test.sh 10 10 5 perf.json"
echo "   $ cat perf.json | jq '.metrics | {avg, p95, p99}'"
echo ""
echo "   B. Compare with baseline:"
echo "   $ cat baseline.json | jq '.metrics.avg_latency'"
echo "   $ cat current.json | jq '.metrics.avg_latency'"
echo ""

# ==========================================================================
# SECTION 7: DEBUG MODE
# ==========================================================================
echo -e "${GREEN}7. DEBUG MODE${NC}"
echo ""
echo "   A. Verbose logging:"
echo "   const client = new HeadlessWSClient({"
echo "       wsUrl: 'ws://localhost:3000',"
echo "       userId: 'test-user',"
echo "       verbose: true,  // ← Enable logging"
echo "   });"
echo ""
echo "   B. Increase timeout:"
echo "   const client = new HeadlessWSClient({"
echo "       timeout: 120000,  // 2 minutes"
echo "   });"
echo ""
echo "   C. Check server logs:"
echo "   $ npm run dev 2>&1 | grep -i error"
echo ""

# ==========================================================================
# SECTION 8: DATA GENERATION
# ==========================================================================
echo -e "${GREEN}8. DATA GENERATION${NC}"
echo ""
echo "   A. Generate test fixture:"
echo "   const fixture = TestDataFactory.generateTestFixture({"
echo "       numUsers: 10,"
echo "       emailsPerUser: 50,"
echo "       providers: ['gmail', 'outlook'],"
echo "   });"
echo ""
echo "   B. Get user data:"
echo "   const userId = fixture.users[0].userId;"
echo "   const connectionId = fixture.users[0].connectionId;"
echo ""

# ==========================================================================
# SECTION 9: CI/CD INTEGRATION
# ==========================================================================
echo -e "${GREEN}9. CI/CD INTEGRATION${NC}"
echo ""
echo "   GitHub Actions workflow ready at:"
echo "   $ .github/workflows/headless-tests.yml"
echo ""
echo "   To use:"
echo "   1. Add secrets to GitHub (GROQ_API_KEY, etc.)"
echo "   2. Push to main or develop branch"
echo "   3. Tests run automatically"
echo ""

# ==========================================================================
# SECTION 10: DOCUMENTATION
# ==========================================================================
echo -e "${GREEN}10. DOCUMENTATION${NC}"
echo ""
echo "   Quick reference:"
echo "   $ HEADLESS_TESTING_QUICK_REFERENCE.md"
echo ""
echo "   Full guide:"
echo "   $ HEADLESS_TESTING_GUIDE.md"
echo ""
echo "   Setup instructions:"
echo "   $ HEADLESS_TESTING_SETUP.md"
echo ""

# ==========================================================================
# SECTION 11: TROUBLESHOOTING
# ==========================================================================
echo -e "${GREEN}11. TROUBLESHOOTING${NC}"
echo ""
echo "   A. Connection refused:"
echo "   $ npm run dev  # Start server"
echo ""
echo "   B. Timeout errors:"
echo "   $ # Check server logs, increase timeout to 120000"
echo ""
echo "   C. Low success rate:"
echo "   $ # Check: PostgreSQL running, Redis running, network OK"
echo ""
echo "   D. What's running on port 3000?"
echo "   $ lsof -i :3000"
echo ""

# ==========================================================================
# SECTION 12: TESTING CHECKLIST
# ==========================================================================
echo -e "${GREEN}12. PRE-COMMIT CHECKLIST${NC}"
echo ""
echo "   Before committing code:"
echo "   [ ] npm test tests/headless-e2e.test.ts  # E2E passes"
echo "   [ ] bash tests/headless-load-test.sh 5 10  # Load test passes"
echo "   [ ] Performance acceptable (< 2s avg)"
echo "   [ ] Success rate > 95%"
echo ""

# ==========================================================================
# FOOTER
# ==========================================================================
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Files: tests/headless-*.ts, HEADLESS_TESTING_*.md${NC}"
echo -e "${BLUE}Run 'cat HEADLESS_TESTING_QUICK_REFERENCE.md' for details${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
