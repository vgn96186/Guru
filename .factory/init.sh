#!/bin/bash
# Drizzle ORM Migration Mission - Environment Setup Script
# This script runs at the start of each worker session

set -e  # Exit on error

echo "=== Drizzle ORM Migration Mission - Environment Setup ==="
echo "Current directory: $(pwd)"
echo "Node version: $(node --version)"
echo "npm version: $(npm --version)"

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
  echo "ERROR: package.json not found. Are you in the project root?"
  exit 1
fi

echo ""
echo "1. Checking dependencies..."

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
  echo "  node_modules not found. Running npm install..."
  npm install
else
  echo "  node_modules exists. Skipping npm install."
fi

echo ""
echo "2. Checking Drizzle dependencies..."

# Check for Drizzle packages
if npm list drizzle-orm > /dev/null 2>&1; then
  echo "  drizzle-orm: ✓ installed"
else
  echo "  drizzle-orm: ✗ missing"
  echo "  Installing Drizzle packages..."
  npm install drizzle-orm drizzle-kit
fi

if npm list drizzle-kit > /dev/null 2>&1; then
  echo "  drizzle-kit: ✓ installed"
else
  echo "  drizzle-kit: ✗ missing"
  npm install drizzle-kit
fi

echo ""
echo "3. Checking TypeScript configuration..."

# Check TypeScript
if [ -f "tsconfig.json" ]; then
  echo "  tsconfig.json: ✓ found"
else
  echo "  tsconfig.json: ✗ missing - this is required"
  exit 1
fi

echo ""
echo "4. Checking database schema files..."

# Check required schema files
REQUIRED_FILES=(
  "src/db/schema.ts"
  "src/db/drizzleSchema.ts"
  "src/db/drizzle.ts"
  "src/db/testing/drizzleSchemaParity.unit.test.ts"
)

for file in "${REQUIRED_FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "  $file: ✓ found"
  else
    echo "  $file: ✗ missing"
  fi
done

echo ""
echo "5. Setting up environment variables..."

# Set default environment variables for Drizzle migration
export DRIZZLE_ENV=development
export EXPO_SQLITE_DEBUG=false
export JEST_MAX_WORKERS=1  # Required for database tests

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
  echo "  Creating .env file with defaults..."
  cat > .env << EOF
# Drizzle ORM Migration Environment
DRIZZLE_ENV=development
EXPO_SQLITE_DEBUG=false

# Feature flags for incremental migration
USE_DRIZZLE_SUBJECTS=false
USE_DRIZZLE_TOPICS=false
USE_DRIZZLE_SESSIONS=false
USE_DRIZZLE_LECTURE_NOTES=false
USE_DRIZZLE_AI_CACHE=false
USE_DRIZZLE_GURU_CHAT=false
USE_DRIZZLE_MIND_MAPS=false

# Debug flags
REACT_DEBUG=false
SQL_DEBUG=false
DRIZZLE_DEBUG=false

# Testing
JEST_MAX_WORKERS=1
TEST_TIMEOUT=30000
EOF
  echo "  .env file created with default values."
else
  echo "  .env file already exists. Preserving existing values."
fi

echo ""
echo "6. Checking test configuration..."

# Check Jest configuration
if [ -f "jest.unit.config.js" ]; then
  echo "  jest.unit.config.js: ✓ found"
  # Check if maxWorkers is set to 1 (required for database tests)
  if grep -q "maxWorkers: 1" jest.unit.config.js; then
    echo "  maxWorkers: ✓ set to 1 (required for database tests)"
  else
    echo "  WARNING: maxWorkers not set to 1. Database tests may fail."
  fi
else
  echo "  jest.unit.config.js: ✗ missing"
fi

echo ""
echo "7. Running initial validation..."

# Run quick checks
echo "  Running npm run typecheck..."
if npm run typecheck > /dev/null 2>&1; then
  echo "  TypeScript: ✓ passes"
else
  echo "  TypeScript: ✗ has errors (expected during migration)"
fi

echo "  Running npm run lint..."
if npm run lint > /dev/null 2>&1; then
  echo "  ESLint: ✓ passes"
else
  echo "  ESLint: ✗ has issues"
fi

echo ""
echo "8. Creating Drizzle migrations directory..."

# Ensure drizzle-migrations directory exists
if [ ! -d "src/db/drizzle-migrations" ]; then
  echo "  Creating src/db/drizzle-migrations directory..."
  mkdir -p src/db/drizzle-migrations
  echo "  Directory created."
else
  echo "  src/db/drizzle-migrations: ✓ exists"
fi

echo ""
echo "9. Generating initial Drizzle schema (if needed)..."

# Check if drizzleSchema.ts has any tables besides user_profile
TABLE_COUNT=$(grep -c "export const" src/db/drizzleSchema.ts 2>/dev/null || echo "0")
if [ "$TABLE_COUNT" -le 1 ]; then
  echo "  Only $TABLE_COUNT table(s) in drizzleSchema.ts"
  echo "  Run 'npx drizzle-kit generate' after adding table definitions"
else
  echo "  Found $TABLE_COUNT tables in drizzleSchema.ts"
  echo "  Running drizzle-kit generate to update migrations..."
  npx drizzle-kit generate > /dev/null 2>&1 && echo "  ✓ Schema generated" || echo "  ✗ Schema generation failed (may be expected)"
fi

echo ""
echo "=== Environment Setup Complete ==="
echo ""
echo "Available commands:"
echo "  npm run test:unit           - Run all unit tests"
echo "  npm run typecheck           - TypeScript type checking"
echo "  npm run lint                - ESLint code quality"
echo "  npx drizzle-kit generate    - Generate Drizzle migrations"
echo "  npm run test:parity         - Run Drizzle schema parity tests"
echo ""
echo "Next steps:"
echo "  1. Check AGENTS.md for mission boundaries"
echo "  2. Review validation-contract.md for requirements"
echo "  3. Start with features.json for implementation tasks"
echo ""
