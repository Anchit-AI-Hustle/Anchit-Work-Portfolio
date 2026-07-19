#!/usr/bin/env bash
#
# setup-gateway.sh — install and launch the TencentDB Agent Memory gateway
# that this MCP bridge talks to.
#
# The gateway is the real memory engine (4-tier local pipeline, SQLite +
# sqlite-vec). This bridge only speaks HTTP to it. Run this once to install,
# then leave it running (or re-run to start it again).
#
# Config comes from environment variables (see .env.example). At minimum the
# distillation step needs an LLM: TDAI_LLM_API_KEY / TDAI_LLM_BASE_URL /
# TDAI_LLM_MODEL. Raw capture/recall work without it, but persona/scene
# distillation does not.
#
# Usage:
#   bash scripts/setup-gateway.sh          # install (if needed) + run in foreground
#   bash scripts/setup-gateway.sh --bg     # install (if needed) + run in background
#
set -euo pipefail

INSTALL_DIR="${TDAI_INSTALL_DIR:-$HOME/.memory-tencentdb/tdai-memory-openclaw-plugin}"
GATEWAY_HOST="${MEMORY_TENCENTDB_GATEWAY_HOST:-127.0.0.1}"
GATEWAY_PORT="${MEMORY_TENCENTDB_GATEWAY_PORT:-8420}"

# Load a sibling .env if present, so `bash scripts/setup-gateway.sh` "just works".
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/../.env" ]; then
  # shellcheck disable=SC1091
  set -a; . "$SCRIPT_DIR/../.env"; set +a
fi

echo "==> TencentDB Agent Memory gateway setup"
echo "    install dir : $INSTALL_DIR"
echo "    listen on   : http://$GATEWAY_HOST:$GATEWAY_PORT"

# 1) Install the plugin package (only if we don't already have it).
if [ ! -d "$INSTALL_DIR" ]; then
  echo "==> Installing @tencentdb-agent-memory/memory-tencentdb ..."
  mkdir -p "$(dirname "$INSTALL_DIR")"
  TEMP_DIR="$(mktemp -d)"
  (
    cd "$TEMP_DIR"
    npm init -y --silent >/dev/null 2>&1
    npm install @tencentdb-agent-memory/memory-tencentdb@latest --omit=dev
  )
  cp -r "$TEMP_DIR/node_modules/@tencentdb-agent-memory/memory-tencentdb" "$INSTALL_DIR"
  rm -rf "$TEMP_DIR"
  ( cd "$INSTALL_DIR" && npm install --omit=dev && npm install tsx )
else
  echo "==> Plugin already installed, skipping install."
fi

# 2) Warn (don't fail) if the LLM key is missing — capture/recall still work.
if [ -z "${TDAI_LLM_API_KEY:-}" ]; then
  echo "!!  TDAI_LLM_API_KEY is not set. Raw capture/recall will work, but"
  echo "!!  persona/scene distillation needs an LLM. See .env.example."
fi

export MEMORY_TENCENTDB_GATEWAY_HOST="$GATEWAY_HOST"
export MEMORY_TENCENTDB_GATEWAY_PORT="$GATEWAY_PORT"

# 3) Launch the gateway.
echo "==> Starting gateway ..."
cd "$INSTALL_DIR"
if [ "${1:-}" = "--bg" ]; then
  LOG_FILE="${TDAI_GATEWAY_LOG:-$HOME/.memory-tencentdb/gateway.log}"
  nohup npx tsx src/gateway/server.ts >"$LOG_FILE" 2>&1 &
  echo "    running in background (PID $!). Logs: $LOG_FILE"
  echo "    verify: curl http://$GATEWAY_HOST:$GATEWAY_PORT/health"
else
  echo "    (Ctrl-C to stop). Verify in another shell:"
  echo "    curl http://$GATEWAY_HOST:$GATEWAY_PORT/health"
  exec npx tsx src/gateway/server.ts
fi
