#!/bin/bash
set -euo pipefail

# Install dependencies for Claude Code on the web sessions only;
# local environments manage their own setup.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

npm install --no-audit --no-fund

echo "Session start hook completed: npm dependencies installed."
