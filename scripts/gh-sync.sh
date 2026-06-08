#!/usr/bin/env bash
#
# gh-sync.sh — auto-commit & push portfolio changes using the GitHub CLI (gh).
#
# Targets the NON-iCloud working repo (~/Projects/awp) so it never touches an
# iCloud-corrupted .git. Auth comes from `gh` (run `gh auth login` once). Because
# the Vercel project is connected to this repo, the push auto-triggers a deploy.
# Safe to run repeatedly; does nothing when unchanged.
#
set -uo pipefail

# Canonical healthy repo lives outside iCloud. Fall back to this script's own repo.
REPO="$HOME/Projects/awp"
if [ ! -d "$REPO/.git" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  REPO="$(dirname "$SCRIPT_DIR")"
fi
cd "$REPO" || exit 1

# Make brew / gh / git visible under launchd's minimal PATH.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)"

# Nothing changed? Exit quietly.
[ -z "$(git status --porcelain)" ] && exit 0

# Ensure git pushes through gh's credentials (no-op if already configured).
command -v gh >/dev/null 2>&1 && gh auth setup-git >/dev/null 2>&1 || true

git add -A || exit 1
git commit -m "Auto-sync: $(date '+%Y-%m-%d %H:%M:%S %Z')" >/dev/null 2>&1
git pull --rebase --autostash origin "$BRANCH" >/dev/null 2>&1 || true
git push origin "$BRANCH"
