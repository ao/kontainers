#!/bin/bash

# Script to install git hooks for Kontainers v2

# Exit if any command fails
set -e

# Get the project root directory
PROJECT_ROOT=$(git rev-parse --show-toplevel)

# Create hooks directory if it doesn't exist
mkdir -p "$PROJECT_ROOT/.git/hooks"

# Install pre-commit hook
echo "Installing pre-commit hook..."
cp "$PROJECT_ROOT/v2/scripts/git-hooks/pre-commit" "$PROJECT_ROOT/.git/hooks/"
chmod +x "$PROJECT_ROOT/.git/hooks/pre-commit"

# Install pre-push hook
echo "Installing pre-push hook..."
cp "$PROJECT_ROOT/v2/scripts/git-hooks/pre-push" "$PROJECT_ROOT/.git/hooks/"
chmod +x "$PROJECT_ROOT/.git/hooks/pre-push"

echo "Git hooks installed successfully! ✅"
echo ""
echo "To temporarily disable hooks, use: SKIP_HOOKS=true git commit/push"
echo "To permanently disable hooks, use: git config --local hooks.enabled false"