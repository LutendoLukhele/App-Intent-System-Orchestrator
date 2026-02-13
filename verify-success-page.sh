#!/bin/bash

# Success Page Implementation - Verification Script
# This script verifies all components are in place

echo "🎯 Verifying Success Page Implementation..."
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check counter
CHECKS_PASSED=0
CHECKS_FAILED=0

# Helper function
check_file() {
  if [ -f "$1" ]; then
    echo -e "${GREEN}✅${NC} File exists: $1"
    ((CHECKS_PASSED++))
  else
    echo -e "${RED}❌${NC} File missing: $1"
    ((CHECKS_FAILED++))
  fi
}

check_directory() {
  if [ -d "$1" ]; then
    echo -e "${GREEN}✅${NC} Directory exists: $1"
    ((CHECKS_PASSED++))
  else
    echo -e "${RED}❌${NC} Directory missing: $1"
    ((CHECKS_FAILED++))
  fi
}

check_content() {
  if grep -q "$2" "$1"; then
    echo -e "${GREEN}✅${NC} Content found in $1"
    ((CHECKS_PASSED++))
  else
    echo -e "${RED}❌${NC} Content not found in $1"
    ((CHECKS_FAILED++))
  fi
}

# ========== VERIFICATION ==========

echo "📁 Checking directories..."
check_directory "src"
check_directory "src/pages"
check_directory "tests"
check_directory "tests/payments"
echo ""

echo "📄 Checking React component files..."
check_file "src/pages/SuccessPage.tsx"
check_file "src/pages/SuccessPage.css"
echo ""

echo "📄 Checking backend files..."
check_file "src/index.ts"
check_file "src/services/StripeService.ts"
check_file "src/config/index.ts"
echo ""

echo "📄 Checking test files..."
check_file "tests/payments/stripe-integration.test.ts"
check_file "tests/payments/setup.ts"
echo ""

echo "📄 Checking documentation..."
check_file "SUCCESS_PAGE_INTEGRATION.md"
check_file "STRIPE_TESTING_GUIDE.md"
check_file "PAYMENT_SYSTEM_STATUS.md"
check_file "SUCCESS_PAGE_QUICK_REFERENCE.md"
check_file "PAYMENT_SYSTEM_FLOW.md"
echo ""

echo "🔍 Checking file contents..."
check_content "src/pages/SuccessPage.tsx" "useSearchParams"
check_content "src/pages/SuccessPage.tsx" "handleViewSubscription"
check_content "src/pages/SuccessPage.tsx" "handleWhatsApp"
check_content "src/pages/SuccessPage.css" "bento-grid"
check_content "src/pages/SuccessPage.css" "bento-block"
check_content "src/index.ts" "app.get('/success'"
check_content "src/index.ts" "app.post('/api/create-payment-link'"
echo ""

echo "📋 Checking configuration..."
if [ -f "package.json" ]; then
  if grep -q "react-router-dom" package.json; then
    echo -e "${GREEN}✅${NC} react-router-dom in package.json"
    ((CHECKS_PASSED++))
  else
    echo -e "${YELLOW}⚠️ ${NC} react-router-dom not in package.json (may need: npm install react-router-dom)"
    ((CHECKS_FAILED++))
  fi
fi
echo ""

# ========== SUMMARY ==========

echo "================================"
echo "📊 Verification Summary"
echo "================================"
echo -e "Checks Passed: ${GREEN}$CHECKS_PASSED${NC}"
echo -e "Checks Failed: ${RED}$CHECKS_FAILED${NC}"
echo ""

if [ $CHECKS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✨ All checks passed!${NC}"
  echo ""
  echo "Next steps:"
  echo "1. Update external links in SuccessPage.tsx:"
  echo "   - WhatsApp phone number (line 45)"
  echo "   - Calendly booking link (line 32)"
  echo "   - App download URLs (lines 38-44)"
  echo ""
  echo "2. Run tests:"
  echo "   npm test -- tests/payments/stripe-integration.test.ts"
  echo ""
  echo "3. Start backend:"
  echo "   npm run dev"
  echo ""
  echo "4. Test payment flow:"
  echo "   curl -X POST http://localhost:8080/api/create-payment-link-public \\"
  echo "     -H 'Content-Type: application/json' \\"
  echo "     -d '{\"email\":\"test@example.com\"}'"
  echo ""
else
  echo -e "${RED}⚠️  Some checks failed. Please review the output above.${NC}"
fi

echo ""
echo "📖 For detailed information, see:"
echo "   - SUCCESS_PAGE_INTEGRATION.md"
echo "   - SUCCESS_PAGE_QUICK_REFERENCE.md"
echo "   - PAYMENT_SYSTEM_STATUS.md"
echo ""
