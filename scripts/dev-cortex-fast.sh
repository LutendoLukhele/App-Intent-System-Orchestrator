#!/bin/bash
# Start development server with fast Cortex polling (5 seconds) for testing

echo "🚀 Starting server with FAST Cortex polling (5 seconds)"
echo "   This is for TESTING only - use normal mode in production"
echo ""

export CORTEX_POLL_INTERVAL_MS=5000

npm run dev
