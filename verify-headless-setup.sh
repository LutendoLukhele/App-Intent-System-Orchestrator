#!/bin/bash

###############################################################################
# VERIFY HEADLESS TESTING SETUP
# Checks that all files are in place and ready to use
###############################################################################

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}HEADLESS TESTING SETUP VERIFICATION${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

ERRORS=0
WARNINGS=0

# Check function
check_file() {
    local file=$1
    local description=$2
    
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC} $description"
        return 0
    else
        echo -e "${RED}✗${NC} $description"
        echo "   Missing: $file"
        ((ERRORS++))
        return 1
    fi
}

check_command() {
    local cmd=$1
    local description=$2
    
    if command -v $cmd &> /dev/null; then
        echo -e "${GREEN}✓${NC} $description ($(which $cmd))"
        return 0
    else
        echo -e "${YELLOW}⚠${NC} $description"
        echo "   Not installed: $cmd"
        ((WARNINGS++))
        return 1
    fi
}

# ========================================================================
# SECTION 1: CHECK TEST FILES
# ========================================================================
echo -e "${BLUE}1. Checking test files...${NC}"

check_file "tests/headless-test-config.ts" "Test data factory configuration"
check_file "tests/headless-ws-client.ts" "WebSocket testing client"
check_file "tests/headless-e2e.test.ts" "E2E test suite (Mocha)"
check_file "tests/headless-examples.ts" "Example test scenarios"
check_file "tests/headless-load-test.sh" "Load testing script"
check_file "tests/setup-headless-tests.sh" "Setup script"
check_file "tests/quick-ref.sh" "Quick reference card"

echo ""

# ========================================================================
# SECTION 2: CHECK DOCUMENTATION
# ========================================================================
echo -e "${BLUE}2. Checking documentation files...${NC}"

check_file "HEADLESS_TESTING_DELIVERABLE.md" "Deliverable summary"
check_file "HEADLESS_TESTING_SETUP.md" "Setup instructions"
check_file "HEADLESS_TESTING_QUICK_REFERENCE.md" "Quick reference"
check_file "HEADLESS_TESTING_GUIDE.md" "Full guide"

echo ""

# ========================================================================
# SECTION 3: CHECK CI/CD
# ========================================================================
echo -e "${BLUE}3. Checking CI/CD files...${NC}"

check_file ".github/workflows/headless-tests.yml" "GitHub Actions workflow"

echo ""

# ========================================================================
# SECTION 4: CHECK DEPENDENCIES
# ========================================================================
echo -e "${BLUE}4. Checking required tools...${NC}"

check_command "node" "Node.js"
check_command "npm" "npm"
check_command "bash" "Bash shell"
check_command "jq" "jq (JSON processor)"

echo ""

# ========================================================================
# SECTION 5: CHECK NODE MODULES
# ========================================================================
echo -e "${BLUE}5. Checking npm packages...${NC}"

if npm list mocha > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} mocha test framework"
else
    echo -e "${YELLOW}⚠${NC} mocha not installed (install with: npm install mocha --save-dev)"
    ((WARNINGS++))
fi

if npm list chai > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} chai assertion library"
else
    echo -e "${YELLOW}⚠${NC} chai not installed (install with: npm install chai --save-dev)"
    ((WARNINGS++))
fi

if npm list ws > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} ws WebSocket library"
else
    echo -e "${YELLOW}⚠${NC} ws not installed (install with: npm install ws)"
    ((WARNINGS++))
fi

echo ""

# ========================================================================
# SECTION 6: CHECK ENVIRONMENT
# ========================================================================
echo -e "${BLUE}6. Checking environment setup...${NC}"

if [ -f ".env.test" ]; then
    echo -e "${GREEN}✓${NC} .env.test configuration file"
    
    # Check for required variables
    REQUIRED_VARS=("TEST_WS_URL" "TEST_DATABASE_URL" "GROQ_API_KEY")
    for var in "${REQUIRED_VARS[@]}"; do
        if grep -q "^$var=" .env.test; then
            echo -e "${GREEN}  ✓${NC} $var is configured"
        else
            echo -e "${YELLOW}  ⚠${NC} $var is missing or not set"
            ((WARNINGS++))
        fi
    done
else
    echo -e "${YELLOW}⚠${NC} .env.test not found"
    echo "   Run: bash tests/setup-headless-tests.sh"
    ((WARNINGS++))
fi

echo ""

# ========================================================================
# SECTION 7: FILE SIZE VERIFICATION
# ========================================================================
echo -e "${BLUE}7. Checking file sizes...${NC}"

if [ -f "tests/headless-test-config.ts" ]; then
    LINES=$(wc -l < "tests/headless-test-config.ts")
    echo "   headless-test-config.ts: $LINES lines"
    if [ $LINES -lt 100 ]; then
        echo -e "${RED}   WARNING: File seems too small${NC}"
        ((WARNINGS++))
    fi
fi

if [ -f "tests/headless-ws-client.ts" ]; then
    LINES=$(wc -l < "tests/headless-ws-client.ts")
    echo "   headless-ws-client.ts: $LINES lines"
fi

if [ -f "tests/headless-e2e.test.ts" ]; then
    LINES=$(wc -l < "tests/headless-e2e.test.ts")
    echo "   headless-e2e.test.ts: $LINES lines"
fi

echo ""

# ========================================================================
# SECTION 8: RUNNING SIMPLE CHECKS
# ========================================================================
echo -e "${BLUE}8. Quick syntax checks...${NC}"

# Check TypeScript compilation
if command -v npx &> /dev/null; then
    echo "   Checking TypeScript syntax..."
    if npx tsc --noEmit 2>/dev/null; then
        echo -e "${GREEN}   ✓${NC} TypeScript compiles successfully"
    else
        echo -e "${YELLOW}   ⚠${NC} TypeScript has errors (this might be OK if server code has issues)"
    fi
else
    echo -e "${YELLOW}   ⚠${NC} Cannot check TypeScript (npx not available)"
fi

echo ""

# ========================================================================
# SUMMARY
# ========================================================================
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✅ ALL CHECKS PASSED${NC}"
    echo ""
    echo "Your headless testing setup is complete!"
    echo ""
    echo "Next steps:"
    echo "  1. Update .env.test with your API keys"
    echo "  2. Start server: npm run dev"
    echo "  3. Run tests: npm test tests/headless-e2e.test.ts"
    echo ""
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠  WARNINGS DETECTED ($WARNINGS)${NC}"
    echo ""
    echo "Warnings don't block testing, but you should resolve them."
    echo "Most common: Install missing npm packages"
    echo ""
    echo "To fix:"
    echo "  npm install mocha chai ws --save-dev"
    echo ""
    exit 0
else
    echo -e "${RED}❌ ERRORS DETECTED ($ERRORS errors, $WARNINGS warnings)${NC}"
    echo ""
    echo "Missing files or setup issues detected."
    echo ""
    echo "To fix:"
    echo "  bash tests/setup-headless-tests.sh"
    echo ""
    exit 1
fi
