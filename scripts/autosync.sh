#!/usr/bin/env bash
#
# autosync.sh — auto-commit & push all portfolio changes to GitHub.
#
# Safe to run repeatedly (from launchd, cron, or by hand). It does nothing
# when there are no changes, and pulls --rebase before pushing so it never
# clobbers commits made elsewhere. Requires your GitHub credential to be
# cached on this Mac (see SYNC-SETUP.md — one-time step).
#
set -uo pipefail

# Resolve the repo as the parent of this script's directory, so the path with
# spaces / apostrophes in it never has to be hard-coded.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(dirname "$SCRIPT_DIR")"
cd "$REPO" || exit 1

# Make common git locations visible when run from launchd (minimal PATH).
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"

# Nothing changed? Exit quietly.
if [ -z "$(git status --porcelain)" ]; then
  exit 0
fi

git add -A || exit 1
git commit -m "Auto-sync: $(date '+%Y-%m-%d %H:%M:%S %Z')" >/dev/null 2>&1

# Integrate any remote changes first, then push.
git pull --rebase --autostash origin "$BRANCH" >/dev/null 2>&1 || true
git push origin "$BRANCH"
