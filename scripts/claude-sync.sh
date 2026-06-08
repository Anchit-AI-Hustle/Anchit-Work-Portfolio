#!/usr/bin/env bash
#
# claude-sync.sh — auto-commit & push portfolio changes using the Claude CLI.
#
# When there are uncommitted changes it asks `claude` (Claude Code) to stage,
# commit with a sensible message, and push to origin main. Because the Vercel
# project is connected to this GitHub repo, the push auto-triggers a deploy.
#
# Falls back to plain git if the Claude CLI isn't found, so sync still works.
# Safe to run repeatedly (does nothing when there are no changes).
#
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(dirname "$SCRIPT_DIR")"
cd "$REPO" || exit 1

# Make Homebrew / npm-global / user-local bins visible under launchd's minimal PATH.
export PATH="$HOME/.local/bin:$HOME/.npm-global/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"

# Nothing changed? Exit quietly.
[ -z "$(git status --porcelain)" ] && exit 0

CLAUDE_BIN="$(command -v claude || true)"

if [ -n "$CLAUDE_BIN" ]; then
  "$CLAUDE_BIN" -p "This git repo has uncommitted changes. Stage all changes, commit with one concise message summarising them, then push to origin $BRANCH. Do nothing else, and do not modify any files." \
    --dangerously-skip-permissions
else
  # Fallback: plain git (requires a cached credential — see SYNC-SETUP.md).
  git add -A || exit 1
  git commit -m "Auto-sync: $(date '+%Y-%m-%d %H:%M:%S %Z')" >/dev/null 2>&1
  git pull --rebase --autostash origin "$BRANCH" >/dev/null 2>&1 || true
  git push origin "$BRANCH"
fi
