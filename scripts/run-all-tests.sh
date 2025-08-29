#!/bin/bash

echo "🚀 Running ALL tests (Bun + Playwright + Integration)"
echo "=================================================="

# Kill any existing server on port 3000
echo "🧹 Cleaning up existing servers..."
pkill -f "bun.*index.ts" 2>/dev/null || true
sleep 1

# Start server in background
echo "📡 Starting server..."
bun run src/index.ts &
SERVER_PID=$!
sleep 3

# Count total tests
echo "📊 Test Summary:"

# Run Bun tests and capture results
echo "🧪 Running Bun tests..."
BUN_OUTPUT=$(bun test 2>&1)
BUN_EXIT=$?
BUN_PASS=$(echo "$BUN_OUTPUT" | grep -o '[0-9]* pass' | head -1 | grep -o '[0-9]*' || echo "0")
BUN_FAIL=$(echo "$BUN_OUTPUT" | grep -o '[0-9]* fail' | head -1 | grep -o '[0-9]*' || echo "0")
echo "   Bun: $BUN_PASS pass, $BUN_FAIL fail"

# Run Playwright tests and capture results  
echo "🎭 Running Playwright tests..."
PLAYWRIGHT_OUTPUT=$(bunx playwright test --reporter=line 2>&1)
PLAYWRIGHT_EXIT=$?
PLAYWRIGHT_PASS=$(echo "$PLAYWRIGHT_OUTPUT" | grep -o '[0-9]* passed' | head -1 | grep -o '[0-9]*' || echo "0")
echo "   Playwright: $PLAYWRIGHT_PASS passed"

# Kill server
kill $SERVER_PID 2>/dev/null

# Calculate totals
TOTAL_PASS=$((BUN_PASS + PLAYWRIGHT_PASS))
TOTAL_FAIL=$BUN_FAIL

echo "=================================================="
echo "📈 TOTAL RESULTS:"
echo "   ✅ Passed: $TOTAL_PASS tests"
echo "   ❌ Failed: $TOTAL_FAIL tests"
echo "   📊 Total: $((TOTAL_PASS + TOTAL_FAIL)) tests"

if [ $BUN_EXIT -eq 0 ] && [ $PLAYWRIGHT_EXIT -eq 0 ]; then
    echo "🎉 ALL TESTS PASSED!"
    exit 0
else
    echo "💥 Some tests failed - run individual test suites for details"
    exit 1
fi
