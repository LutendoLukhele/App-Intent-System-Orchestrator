#!/bin/bash

###############################################################################
# Headless Load Testing Script
# Simulates multiple concurrent users and measures system performance
###############################################################################

set -e

# Configuration
WS_URL="${TEST_WS_URL:-ws://localhost:3000}"
NUM_USERS="${1:-5}"
REQUESTS_PER_USER="${2:-10}"
CONCURRENT_CONNECTIONS="${3:-5}"
OUTPUT_FILE="${4:-./test-results.json}"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting headless load test${NC}"
echo "Configuration:"
echo "  WebSocket URL: $WS_URL"
echo "  Number of users: $NUM_USERS"
echo "  Requests per user: $REQUESTS_PER_USER"
echo "  Concurrent connections: $CONCURRENT_CONNECTIONS"
echo "  Output file: $OUTPUT_FILE"
echo ""

# Test data
TEST_QUERIES=(
    "Show me my most recent emails from today"
    "What are my unread messages?"
    "Check my calendar for today"
    "Fetch emails excluding promotions"
    "Get emails from the last week"
    "Show important emails"
    "Search for emails from my manager"
    "List calendar events for this week"
    "Check notifications"
    "Summary of today's activity"
)

# Track metrics
START_TIME=$(date +%s)
TOTAL_REQUESTS=0
SUCCESSFUL_REQUESTS=0
FAILED_REQUESTS=0
TOTAL_LATENCY=0
declare -a LATENCIES

###############################################################################
# Test a single user with multiple requests
###############################################################################
test_user() {
    local user_id="$1"
    local num_requests="$2"
    
    echo -e "${GREEN}Testing user: $user_id${NC}"
    
    for ((i = 1; i <= num_requests; i++)); do
        # Select random query
        local query_idx=$((RANDOM % ${#TEST_QUERIES[@]}))
        local query="${TEST_QUERIES[$query_idx]}"
        
        # Run test using Node.js script
        local start=$(date +%s%N)
        
        if node - << EOF 2>/dev/null
const WebSocket = require('ws');
const ws = new WebSocket('$WS_URL', {handshakeTimeout: 30000});
let resolved = false;

const timeout = setTimeout(() => {
    if (!resolved) {
        ws.close();
        process.exit(1);
    }
}, 35000);

ws.on('open', () => {
    ws.send(JSON.stringify({
        type: 'auth_message',
        payload: {
            userId: '$user_id',
            sessionId: 'load-test-' + Date.now(),
            authToken: 'mock-token-loadtest'
        }
    }));
});

ws.on('message', (data) => {
    try {
        const msg = JSON.parse(data);
        if (msg.type === 'conversational_response_complete') {
            resolved = true;
            ws.close();
        }
    } catch(e) {}
});

ws.on('error', () => {
    ws.close();
});

ws.on('close', () => {
    process.exit(resolved ? 0 : 1);
});

setTimeout(() => {
    if (!resolved) {
        ws.close();
        process.exit(1);
    }
}, 35000);
EOF
        then
            ((SUCCESSFUL_REQUESTS++))
            local end=$(date +%s%N)
            local latency=$(( (end - start) / 1000000 )) # Convert to ms
            LATENCIES+=($latency)
            TOTAL_LATENCY=$((TOTAL_LATENCY + latency))
            echo -e "  ${GREEN}✓${NC} Request $i: ${latency}ms - $query"
        else
            ((FAILED_REQUESTS++))
            echo -e "  ${RED}✗${NC} Request $i failed - $query"
        fi
        
        ((TOTAL_REQUESTS++))
        
        # Small delay between requests
        sleep 1
    done
}

###############################################################################
# Run tests
###############################################################################

# Test sequential users first to avoid overwhelming the system
for ((user = 1; user <= NUM_USERS; user++)); do
    test_user "load-test-user-$user" "$REQUESTS_PER_USER" &
    
    # Limit concurrent connections
    if (( user % CONCURRENT_CONNECTIONS == 0 )); then
        wait
    fi
done

# Wait for remaining background jobs
wait

###############################################################################
# Calculate metrics
###############################################################################

END_TIME=$(date +%s)
TOTAL_TIME=$((END_TIME - START_TIME))

# Calculate averages
AVG_LATENCY=0
if [ $SUCCESSFUL_REQUESTS -gt 0 ]; then
    AVG_LATENCY=$((TOTAL_LATENCY / SUCCESSFUL_REQUESTS))
fi

# Find min/max latency
MIN_LATENCY=${LATENCIES[0]:-0}
MAX_LATENCY=${LATENCIES[0]:-0}
for latency in "${LATENCIES[@]}"; do
    if [ $latency -lt $MIN_LATENCY ]; then MIN_LATENCY=$latency; fi
    if [ $latency -gt $MAX_LATENCY ]; then MAX_LATENCY=$latency; fi
done

SUCCESS_RATE=0
if [ $TOTAL_REQUESTS -gt 0 ]; then
    SUCCESS_RATE=$((SUCCESSFUL_REQUESTS * 100 / TOTAL_REQUESTS))
fi

###############################################################################
# Output results
###############################################################################

echo ""
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo -e "${BLUE}Load Test Results${NC}"
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo "Total Time: ${TOTAL_TIME}s"
echo "Total Requests: $TOTAL_REQUESTS"
echo -e "Successful: ${GREEN}$SUCCESSFUL_REQUESTS${NC}"
echo -e "Failed: ${RED}$FAILED_REQUESTS${NC}"
echo "Success Rate: $SUCCESS_RATE%"
echo ""
echo "Latency Metrics (ms):"
echo "  Average: ${AVG_LATENCY}ms"
echo "  Min: ${MIN_LATENCY}ms"
echo "  Max: ${MAX_LATENCY}ms"
echo "  P95: (calculated from histogram)"
echo ""
echo "Throughput:"
echo "  Requests/second: $(( TOTAL_REQUESTS / (TOTAL_TIME + 1) ))"

# Write JSON results
cat > "$OUTPUT_FILE" << EOFRESULTS
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "configuration": {
    "wsUrl": "$WS_URL",
    "numUsers": $NUM_USERS,
    "requestsPerUser": $REQUESTS_PER_USER,
    "concurrentConnections": $CONCURRENT_CONNECTIONS
  },
  "results": {
    "totalTime": $TOTAL_TIME,
    "totalRequests": $TOTAL_REQUESTS,
    "successfulRequests": $SUCCESSFUL_REQUESTS,
    "failedRequests": $FAILED_REQUESTS,
    "successRate": $SUCCESS_RATE,
    "latency": {
      "average": $AVG_LATENCY,
      "min": $MIN_LATENCY,
      "max": $MAX_LATENCY
    },
    "throughput": {
      "requestsPerSecond": $(( TOTAL_REQUESTS / (TOTAL_TIME + 1) ))
    }
  }
}
EOFRESULTS

echo ""
echo -e "${GREEN}Results saved to: $OUTPUT_FILE${NC}"

# Exit with status based on success rate
if [ $SUCCESS_RATE -ge 95 ]; then
    echo -e "${GREEN}✅ Load test PASSED${NC}"
    exit 0
else
    echo -e "${RED}❌ Load test FAILED (success rate below 95%)${NC}"
    exit 1
fi
