#!/bin/bash

###############################################################################
# Quick Setup for Headless Testing
# Configures environment and runs initial validation
###############################################################################

set -e

echo "🚀 Setting up headless testing environment..."

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Step 1: Check Node.js
echo -e "${BLUE}[1/5]${NC} Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found${NC}"
    exit 1
fi
NODE_VERSION=$(node -v)
echo -e "${GREEN}✓${NC} Node.js $NODE_VERSION"

# Step 2: Check dependencies
echo -e "${BLUE}[2/5]${NC} Checking npm dependencies..."
REQUIRED_PACKAGES=("ws" "mocha" "chai")
for pkg in "${REQUIRED_PACKAGES[@]}"; do
    if ! npm list $pkg &>/dev/null; then
        echo -e "${YELLOW}Installing $pkg...${NC}"
        npm install $pkg --save-dev
    fi
done
echo -e "${GREEN}✓${NC} Dependencies OK"

# Step 3: Create environment file
echo -e "${BLUE}[3/5]${NC} Creating .env.test..."
if [ ! -f ".env.test" ]; then
    cat > .env.test << 'EOF'
# Headless Testing Configuration

# WebSocket Server
TEST_WS_URL=ws://localhost:3000

# API Endpoint
TEST_API_URL=http://localhost:3000/api

# Database (use test DB!)
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/cortex_test

# Redis
TEST_REDIS_URL=redis://localhost:6379

# Logging
TEST_LOG_LEVEL=info

# API Keys (from .env)
GROQ_API_KEY=your_groq_key_here
NANGO_API_KEY=your_nango_key_here
NANGO_SECRET_KEY=your_nango_secret_here
EOF
    echo -e "${GREEN}✓${NC} Created .env.test"
else
    echo -e "${GREEN}✓${NC} .env.test already exists"
fi

# Step 4: Check database
echo -e "${BLUE}[4/5]${NC} Checking database..."
if command -v psql &> /dev/null; then
    if psql -U postgres -d postgres -c "SELECT 1" &>/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} PostgreSQL running"
        
        # Create test database if needed
        if ! psql -U postgres -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'cortex_test'" | grep -q 1; then
            echo -e "${YELLOW}Creating cortex_test database...${NC}"
            psql -U postgres -d postgres -c "CREATE DATABASE cortex_test;"
            echo -e "${GREEN}✓${NC} Created cortex_test database"
        fi
    else
        echo -e "${YELLOW}⚠${NC} PostgreSQL not responding (test will use env var)"
    fi
else
    echo -e "${YELLOW}⚠${NC} psql not found (database must be running separately)"
fi

# Step 5: Check Redis
echo -e "${BLUE}[5/5]${NC} Checking Redis..."
if command -v redis-cli &> /dev/null; then
    if redis-cli ping &>/dev/null 2>&1; then
        echo -e "${GREEN}✓${NC} Redis running"
    else
        echo -e "${YELLOW}⚠${NC} Redis not responding (make sure it's running)"
    fi
else
    echo -e "${YELLOW}⚠${NC} redis-cli not found (Redis must be running separately)"
fi

echo ""
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Setup complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo ""
echo "Next steps:"
echo "1. Update .env.test with your API keys"
echo "2. Start your server: npm run dev"
echo "3. Run tests: npm test tests/headless-e2e.test.ts"
echo "4. Or run load test: bash tests/headless-load-test.sh 5 10"
echo ""
echo "Documentation: see HEADLESS_TESTING_GUIDE.md"
