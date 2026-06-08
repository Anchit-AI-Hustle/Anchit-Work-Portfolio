# Fix the corrupt git repo ("pack ... is far too short to be a packfile")

**Cause:** this folder lives in iCloud Drive, which evicts/truncates git's binary
pack files (`.git/objects/pack/*.pack`). Your actual work is safe — it's in the
working files, not the packs. Only `.git` is damaged. (A Cowork session also left
a harmless junk `.git/.git` folder while trying to help; the steps below remove it.)

Run these in **Terminal on your Mac** (native filesystem, where git works):

```bash
REPO="/Users/anchittandon/Library/Mobile Documents/com~apple~CloudDocs/ANCHIT'S AI HUSTLE/Anchit-Work-Portfolio"

# 1) Delete the corrupt repo metadata (this does NOT touch your index.html / files)
cd "$REPO"
rm -rf .git

# 2) Clone a fresh, healthy copy OUTSIDE iCloud
git clone https://github.com/Anchit-AI-Hustle/Anchit-Work-Portfolio.git ~/awp-fresh

# 3) Move the healthy .git into your folder
cp -R ~/awp-fresh/.git "$REPO/.git"

# 4) Verify — your edited files now show up as normal changes
cd "$REPO"
git fsck            # should report no errors
git status          # your index.html etc. appear as "modified"
```

Then commit + push as usual (this also auto-deploys via Vercel):

```bash
git add -A
git commit -m "Portfolio updates"
git push origin main
```

---

## Stop it from happening again (important)

Git + iCloud Drive is the root cause and it WILL recur. Pick one:

**A — Best: keep your working clone outside iCloud.**
```bash
git clone https://github.com/Anchit-AI-Hustle/Anchit-Work-Portfolio.git ~/Projects/Anchit-Work-Portfolio
```
Work in `~/Projects/...`. Vercel still deploys from GitHub, so nothing else changes.
(You can keep the iCloud copy for reference, just don't run git in it.)

**B — If you must keep it in iCloud:** stop iCloud from evicting the pack files:
- Finder → right-click this folder → **Keep Downloaded**.
- System Settings → Apple ID → iCloud → iCloud Drive → turn **off "Optimize Mac Storage"**.

Option A is strongly recommended — it removes the failure mode entirely.
