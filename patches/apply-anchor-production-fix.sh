#!/usr/bin/env bash
# Apply the ANCHOR lyriccheck/catalogue fix on a local clone of
# Anchit-AI-Hustle/anchor-autopilot, push it, and (if vercel is logged in)
# deploy the site. Run from anywhere:
#   bash patches/apply-anchor-production-fix.sh /path/to/anchor-autopilot
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PATCH="$ROOT/patches/anchor-production-fix.patch"
DEST="${1:-}"
if [ -z "$DEST" ]; then
  echo "usage: $0 /path/to/anchor-autopilot" >&2
  exit 2
fi
cd "$DEST"
git fetch origin main
git checkout -B cursor/lyriccheck-timeout-f7d8 origin/main
git am --3way "$PATCH"
git push -u origin cursor/lyriccheck-timeout-f7d8
if command -v vercel >/dev/null 2>&1; then
  (cd site && vercel --prod --yes --scope "${VERCEL_TEAM:-anchit-ai-hustle}") || true
fi
echo "Pushed cursor/lyriccheck-timeout-f7d8. Open a PR against main on ANCHOR."
