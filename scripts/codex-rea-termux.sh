#!/usr/bin/env bash
# Launch the previously verified Codex + REA MCP session in Ubuntu PRoot/Termux.
# The file changes no Codex configuration and does not install providers.
set -euo pipefail

if ! command -v codex >/dev/null 2>&1; then
  echo "Codex CLI is missing. Install and authenticate Codex first." >&2
  exit 127
fi
if ! command -v npx >/dev/null 2>&1; then
  echo "Node.js/npm (npx) is missing. Check your Ubuntu environment." >&2
  exit 127
fi

# This host required --no-daemon; the original shorter MCP startup timeout
# caused the separately healthy REA stdio server to appear as 'failed'.
exec codex --no-daemon \
  -c 'mcp_servers.rea.startup_timeout_sec=60' \
  -c 'mcp_optional_startup_grace_ms=30000' \
  "$@"
