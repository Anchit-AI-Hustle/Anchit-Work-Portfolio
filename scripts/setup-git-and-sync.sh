#!/usr/bin/env bash
#
# setup-git-and-sync.sh — ONE-SHOT: resolve the iCloud git corruption for good and
# turn on permanent auto-sync.
#
# What it does:
#   1. Clones a fresh, healthy repo OUTSIDE iCloud at ~/Projects/awp
#   2. Copies your current edits from the iCloud folder into it
#   3. Commits + pushes (which auto-deploys via Vercel)
#   4. Installs a launchd agent that auto-syncs ~/Projects/awp every 10 min + at login
#
# Run once, on your Mac:
#   bash "/Users/anchittandon/Library/Mobile Documents/com~apple~CloudDocs/ANCHIT'S AI HUSTLE/Anchit-Work-Portfolio/scripts/setup-git-and-sync.sh"
#
# Prereq: GitHub CLI authenticated — `brew install gh && gh auth login` (HTTPS).
#
set -uo pipefail

ICLOUD="/Users/anchittandon/Library/Mobile Documents/com~apple~CloudDocs/ANCHIT'S AI HUSTLE/Anchit-Work-Portfolio"
DEST="$HOME/Projects/awp"
REPO_URL="https://github.com/Anchit-AI-Hustle/Anchit-Work-Portfolio.git"
PLIST="$HOME/Library/LaunchAgents/com.anchit.portfolio.autosync.plist"

echo "▶ 1/4  Ensuring GitHub auth…"
if command -v gh >/dev/null 2>&1; then
  gh auth status >/dev/null 2>&1 || { echo "  → Run 'gh auth login' first, then re-run this."; exit 1; }
  gh auth setup-git >/dev/null 2>&1 || true
else
  echo "  → GitHub CLI not found. Install with: brew install gh && gh auth login"; exit 1
fi

echo "▶ 2/4  Fresh healthy clone outside iCloud → $DEST"
if [ ! -d "$DEST/.git" ]; then
  mkdir -p "$(dirname "$DEST")"
  git clone "$REPO_URL" "$DEST"
fi

echo "▶ 3/4  Copying your current edits in (excluding broken .git / ignored dirs)…"
rsync -a --exclude='.git' --exclude='node_modules' --exclude='www' --exclude='.vercel' "$ICLOUD"/ "$DEST"/

cd "$DEST" || exit 1
if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit -m "Sync working copy: $(date '+%Y-%m-%d %H:%M:%S %Z')" || true
fi
git pull --rebase --autostash origin main >/dev/null 2>&1 || true
echo "  → pushing…"
git push origin main

echo "▶ 4/4  Installing auto-sync agent (every 10 min + at login)…"
chmod +x "$DEST/scripts/gh-sync.sh" 2>/dev/null || true
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.anchit.portfolio.autosync</string>
  <key>ProgramArguments</key><array>
    <string>/bin/bash</string>
    <string>$DEST/scripts/gh-sync.sh</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>600</integer>
  <key>StandardOutPath</key><string>/tmp/anchit-portfolio-autosync.out</string>
  <key>StandardErrorPath</key><string>/tmp/anchit-portfolio-autosync.err</string>
</dict></plist>
PLISTEOF
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo ""
echo "✅ Done."
echo "   Working repo (use this from now on):  $DEST"
echo "   Auto-sync: every 10 min + at login. Logs: /tmp/anchit-portfolio-autosync.*"
echo "   Do NOT run git in the iCloud folder anymore — that's what was corrupting it."
