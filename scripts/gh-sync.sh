#!/usr/bin/env bash
#
# gh-sync.sh — auto-commit & push portfolio changes using the GitHub CLI (gh).
#
# Auth is provided by `gh` (run `gh auth login` + `gh auth setup-git` once — see
# SYNC-SETUP.md). Because the Vercel project is connected to this repo, the push
# auto-triggers a deploy. Safe to run repeatedly; does nothing when unchanged.
#
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(dirname "$SCRIPT_DIR")"
cd "$REPO" || exit 1

# Make brew / gh / git visible under launchd's minimal PATH.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"

# Nothing changed? Exit quietly.
[ -z "$(git status --porcelain)" ] && exit 0

# Ensure git pushes through gh's credentials (no-op if already configured).
if command -v gh >/dev/null 2>&1; then
  gh auth setup-git >/dev/null 2>&1 || true
fi

git add -A || exit 1
git commit -m "Auto-sync: $(date '+%Y-%m-%d %H:%M:%S %Z')" >/dev/null 2>&1
git pull --rebase --autostash origin "$BRANCH" >/dev/null 2>&1 || true
git push origin "$BRANCH"
