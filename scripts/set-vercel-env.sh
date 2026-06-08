#!/usr/bin/env bash
#
# set-vercel-env.sh — set the portfolio's API keys in Vercel and redeploy.
#
# Run on your Mac, from the healthy repo:
#   cd ~/Projects/awp && bash scripts/set-vercel-env.sh
#
# It prompts for each value (input hidden), writes it to Production/Preview/
# Development, then redeploys to production. Leave a prompt blank to skip it.
# You create the keys yourself; this script never stores or transmits them anywhere
# except to your own Vercel project via the official Vercel CLI.
#
set -uo pipefail

command -v vercel >/dev/null 2>&1 || { echo "Vercel CLI missing. Run: npm i -g vercel && vercel login"; exit 1; }
[ -d .vercel ] || { echo "This folder isn't linked to a Vercel project. Run: vercel link"; exit 1; }

ENVS=(production preview development)

set_env() {
  local name="$1" val="$2"
  [ -z "$val" ] && { echo "  · $name — skipped"; return; }
  for e in "${ENVS[@]}"; do
    vercel env rm "$name" "$e" -y >/dev/null 2>&1 || true   # remove old value if present
    printf '%s' "$val" | vercel env add "$name" "$e" >/dev/null 2>&1 \
      && echo "  ✓ $name → $e" || echo "  ✗ $name → $e (failed)"
  done
}

ask() {  # ask VARNAME "Prompt"  → hidden input into global REPLY_VAL
  local prompt="$2"
  printf '%s: ' "$prompt" >&2
  read -rs REPLY_VAL; echo "" >&2
}

echo "Setting Vercel environment variables for $(basename "$PWD")"
echo "(input is hidden; press Enter on a blank line to skip)"
echo ""

ask K "ANTHROPIC_API_KEY (sk-ant-...)";            set_env ANTHROPIC_API_KEY "$REPLY_VAL"

echo ""
echo "Voice (optional — set ElevenLabs OR HuggingFace, or skip both):"
ask K "ELEVENLABS_API_KEY";                        set_env ELEVENLABS_API_KEY "$REPLY_VAL"
ask K "ELEVENLABS_VOICE_ID";                       set_env ELEVENLABS_VOICE_ID "$REPLY_VAL"
ask K "HF_TOKEN";                                  set_env HF_TOKEN "$REPLY_VAL"
ask K "HF_TTS_MODEL (e.g. a TTS model id)";        set_env HF_TTS_MODEL "$REPLY_VAL"

echo ""
echo "▶ Redeploying to production so the new vars take effect…"
vercel --prod

echo ""
echo "✅ Done. Check the chat — it now answers via Claude (falls back to the offline bot if the key is ever missing)."
