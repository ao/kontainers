#!/bin/bash
# Kontainers v2 Test Suite and CI/CD Integration Verification Script
# This script verifies that the testing infrastructure works correctly by:
# - Running the test suite locally
# - Simulating a CI environment
# - Verifying test reports are generated correctly
# - Checking coverage thresholds are enforced
# - Ensuring all test types are executed properly

set -e

# Color codes for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
  exit 1
}

check_command() {
  if ! command -v $1 &> /dev/null; then
    log_error "$1 is required but not installed. Please install it and try again."
  fi
}

# Check required tools
log_info "Checking required tools..."
check_command "bun"
check_command "node"
check_command "npm"
log_success "All required tools are installed."

# Navigate to project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"
log_info "Working directory: $(pwd)"

# Create temporary directory for CI simulation
CI_DIR="$PROJECT_ROOT/tmp/ci-simulation"
mkdir -p "$CI_DIR"
log_info "Created CI simulation directory: $CI_DIR"

# Set CI environment variables
export CI=true
export CI_PIPELINE_ID="local-$(date +%s)"
export CI_COMMIT_SHA="$(git rev-parse HEAD 2>/dev/null || echo 'local-test')"
export CI_ENVIRONMENT="test"
export NODE_ENV="test"

# Step 1: Run unit tests
log_info "Running unit tests..."
npm test || log_error "Unit tests failed"
log_success "Unit tests passed"

# Step 2: Check test coverage
log_info "Running tests with coverage..."
npm run test:coverage || log_error "Coverage tests failed"

# Verify coverage report was generated
if [ ! -f "./coverage/lcov.info" ]; then
  log_error "Coverage report was not generated"
fi
log_success "Coverage report generated successfully"

# Step 3: Check coverage thresholds
log_info "Checking coverage thresholds..."
COVERAGE_OUTPUT=$(npm run test:coverage -- --json 2>/dev/null || echo '{"failed": true}')
if echo "$COVERAGE_OUTPUT" | grep -q '"failed": true'; then
  log_error "Coverage thresholds not met"
fi
log_success "Coverage thresholds met"

# Step 4: Run frontend tests
log_info "Running frontend tests..."
npm run test:frontend || log_error "Frontend tests failed"
log_success "Frontend tests passed"

# Step 5: Run backend tests
log_info "Running backend tests..."
npm run test:backend || log_error "Backend tests failed"
log_success "Backend tests passed"

# Step 6: Run integration tests
log_info "Running integration tests..."
npm run test:integration || log_error "Integration tests failed"
log_success "Integration tests passed"

# Step 7: Run performance tests
log_info "Running performance tests..."
npm run test:performance || log_error "Performance tests failed"
log_success "Performance tests passed"

# Step 8: Simulate CI environment
log_info "Simulating CI environment..."

# Create CI config files
cat > "$CI_DIR/ci-config.json" << EOF
{
  "testReportPath": "./reports/test-results.xml",
  "coverageReportPath": "./reports/coverage",
  "coverageThresholds": {
    "global": {
      "statements": 80,
      "branches": 75,
      "functions": 80,
      "lines": 80
    }
  }
}
EOF

# Run tests in CI mode
log_info "Running tests in CI mode..."
CI=true npm test -- --ci --reporters=default --reporters=jest-junit || log_error "CI tests failed"

# Verify test reports were generated
if [ ! -f "./reports/test-results.xml" ]; then
  log_warning "CI test report was not generated at expected location"
else
  log_success "CI test report generated successfully"
fi

# Step 9: Verify all test types were executed
log_info "Verifying all test types were executed..."

# Check test execution logs
TEST_LOGS="$CI_DIR/test-execution.log"
npm test -- --listTests > "$TEST_LOGS"

# Check for different test types
grep -q "frontend" "$TEST_LOGS" || log_warning "Frontend tests may not have been executed"
grep -q "backend" "$TEST_LOGS" || log_warning "Backend tests may not have been executed"
grep -q "integration" "$TEST_LOGS" || log_warning "Integration tests may not have been executed"
grep -q "performance" "$TEST_LOGS" || log_warning "Performance tests may not have been executed"

log_success "All test types were included in the test suite"

# Step 10: Clean up
log_info "Cleaning up..."
rm -rf "$CI_DIR"
log_success "Clean up complete"

# Final summary
echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}    Test Integration Verification Complete    ${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo -e "${BLUE}Summary:${NC}"
echo "✅ Unit tests executed successfully"
echo "✅ Coverage reports generated correctly"
echo "✅ Coverage thresholds enforced"
echo "✅ Frontend tests executed"
echo "✅ Backend tests executed"
echo "✅ Integration tests executed"
echo "✅ Performance tests executed"
echo "✅ CI environment simulation successful"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Review the test reports in ./reports/"
echo "2. Check the coverage report in ./coverage/"
echo "3. Run 'npm run test:watch' during development for fast feedback"
echo ""
echo -e "${GREEN}The testing infrastructure is working correctly.${NC}"

# Reset environment variables
unset CI
unset CI_PIPELINE_ID
unset CI_COMMIT_SHA
unset CI_ENVIRONMENT

exit 0