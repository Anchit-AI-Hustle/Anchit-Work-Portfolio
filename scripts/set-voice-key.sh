#!/usr/bin/env bash
# set-voice-key.sh — put your ElevenLabs key into Vercel without it ever leaking.
#
# WHY THIS SCRIPT EXISTS
#   Typing a key into a chat window, a commit, or even a plain shell command is
#   how keys escape. This reads it with the terminal echo OFF, keeps it only in
#   a shell variable, hands it to Vercel over a PIPE, and wipes it on exit.
#
#   Specifically, the key is never:
#     · echoed to the screen              (read -s)
#     · written into your shell history   (read, not an inline assignment)
#     · visible in the process list       (piped on stdin, never `--value`)
#     · written to disk                   (no temp files, no .env)
#     · readable back out of Vercel       (stored with --sensitive)
#
# USAGE
#   bash scripts/set-voice-key.sh              # portfolio only (default)
#   bash scripts/set-voice-key.sh --all        # every project in the team
#   bash scripts/set-voice-key.sh --clone      # also create the voice + set its ID
#
set -uo pipefail

TEAM="${VERCEL_TEAM:-anchit-ai-hustle}"
VERCEL="vercel --scope $TEAM"
ENVS=(production preview development)

# Only the portfolio actually reads ELEVENLABS_* today (api/tts.js). The others
# are listed so --all can fan out if you add voice to them later; an unused env
# var is inert, but a secret is still a secret, so this is opt-in rather than
# the default.
PROJECTS_DEFAULT=(anchit-work-portfolio)
PROJECTS_ALL=(anchit-work-portfolio the-third-eye vahdam-lifecycle-os the-passion-table marketing-mailers-html-architect)

PROJECTS=("${PROJECTS_DEFAULT[@]}")
DO_CLONE=0
for arg in "$@"; do
  case "$arg" in
    --all)   PROJECTS=("${PROJECTS_ALL[@]}") ;;
    --clone) DO_CLONE=1 ;;
    *) echo "Unknown option: $arg"; exit 1 ;;
  esac
done

command -v vercel >/dev/null 2>&1 || { echo "✗ Vercel CLI missing.  npm i -g vercel"; exit 1; }
$VERCEL whoami >/dev/null 2>&1 || { echo "→ Logging in to Vercel…"; $VERCEL login || exit 1; }

# Wipe the key from memory on ANY exit path, including Ctrl-C.
cleanup() { unset ELEVENLABS_API_KEY VOICE_ID 2>/dev/null || true; }
trap cleanup EXIT INT TERM

# ── the safe input block ──────────────────────────────────────────────────
# -s: no echo.  -r: no backslash mangling.  Nothing lands in history.
printf 'Paste your ElevenLabs API key (input hidden, press Enter): ' >&2
read -rs ELEVENLABS_API_KEY
printf '\n' >&2

[ -n "${ELEVENLABS_API_KEY:-}" ] || { echo "✗ Nothing entered — aborted."; exit 1; }
# Validate shape WITHOUT printing the value.
case "$ELEVENLABS_API_KEY" in
  sk_*) ;;
  *) echo "✗ That does not look like an ElevenLabs key (expected it to start with sk_). Aborted."; exit 1 ;;
esac
echo "✓ Key read (${#ELEVENLABS_API_KEY} characters). It will not be displayed again."

# ── optional: create the clone and capture its voice id ───────────────────
VOICE_ID=""
if [ "$DO_CLONE" = "1" ]; then
  echo "→ Creating the voice clone from audio/anchit-xtts-sample.wav…"
  # The key goes to the child process as an env var for this one command only.
  CLONE_OUT="$(ELEVENLABS_API_KEY="$ELEVENLABS_API_KEY" node scripts/elevenlabs-clone.mjs 2>&1)" || {
    echo "$CLONE_OUT" | grep -v 'sk_'   # never echo a line that could carry the key
    echo "✗ Clone failed — see the message above. Env vars were NOT written."
    exit 1
  }
  VOICE_ID="$(printf '%s' "$CLONE_OUT" | sed -n 's/.*ELEVENLABS_VOICE_ID = \([A-Za-z0-9]*\).*/\1/p' | head -1)"
  [ -n "$VOICE_ID" ] && echo "✓ Voice created: $VOICE_ID" || echo "! Clone ran but no voice id parsed; setting the key only."
fi

# ── write to Vercel ───────────────────────────────────────────────────────
# --sensitive  → Vercel stores it write-only; nobody (including you) can read
#                the value back from the dashboard or CLI afterwards.
# --force      → replace any existing value instead of erroring.
# stdin        → the value never appears as a process argument.
set_var() {
  local name="$1" value="$2" project="$3" env="$4"
  # --sensitive is only accepted for Production and Preview; Development
  # rejects it, so fall back rather than silently skipping that environment.
  if printf '%s' "$value" \
       | $VERCEL env add "$name" "$env" --project "$project" --sensitive --force --yes >/dev/null 2>&1; then
    echo "  ✓ $name → $project/$env (sensitive)"
  elif printf '%s' "$value" \
       | $VERCEL env add "$name" "$env" --project "$project" --force --yes >/dev/null 2>&1; then
    echo "  ✓ $name → $project/$env"
  else
    echo "  ✗ $name → $project/$env (failed)"
  fi
}

for project in "${PROJECTS[@]}"; do
  echo ""
  echo "▲ $project"
  for env in "${ENVS[@]}"; do
    set_var ELEVENLABS_API_KEY "$ELEVENLABS_API_KEY" "$project" "$env"
    [ -n "$VOICE_ID" ] && set_var ELEVENLABS_VOICE_ID "$VOICE_ID" "$project" "$env"
  done
done

cleanup
echo ""
echo "Done. Redeploy for the new values to take effect:"
echo "    vercel --prod --scope $TEAM"
echo "Then confirm (returns booleans only, never the key):"
echo "    curl -s https://anchit-tandon.com/api/tts"
