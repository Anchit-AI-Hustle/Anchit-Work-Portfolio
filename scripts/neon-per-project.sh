#!/usr/bin/env bash
# Provision one Neon project per Vercel project, via the Vercel CLI.
#
# WHY A SCRIPT AND NOT A ONE-LINER: `vercel integration add` provisions a
# BILLABLE resource. Run it in a loop over a list you have not read and you can
# create dozens of paid databases in under a minute. So this defaults to a dry
# run and prints exactly what it would do.
#
#   ./scripts/neon-per-project.sh                 # dry run, prints the commands
#   APPLY=1 ./scripts/neon-per-project.sh         # actually provision
#   APPLY=1 PLAN=free ./scripts/neon-per-project.sh
#
# It must run on a machine that can reach api.vercel.com. This repo's sandbox
# cannot: the agent proxy returns 403 for api.vercel.com and console.neon.tech,
# which is an organisation egress policy, not a credential problem.
#
# PREREQUISITES
#   vercel login                  # once, interactive
#   Each app must already be a Vercel project.
#
# One Neon project per app gives hard isolation: separate connection strings,
# separate quotas, and no chance of one app's migration touching another's data.
# The cost is one more thing to keep an eye on per app. If you only want
# isolation between environments of the SAME app, Neon branches inside a single
# project do that for free and this script is the wrong tool.
set -euo pipefail

APPS_FILE="${APPS_FILE:-scripts/neon-apps.txt}"
PLAN="${PLAN:-free}"
APPLY="${APPLY:-0}"
REGION="${REGION:-aws-us-east-1}"

[ -f "$APPS_FILE" ] || { echo "No app list at $APPS_FILE"; exit 1; }

command -v vercel >/dev/null || { echo "vercel CLI not found — npm i -g vercel"; exit 1; }
if ! vercel whoami >/dev/null 2>&1; then
  echo "Not logged in. Run: vercel login"; exit 1
fi

# Blank lines and #comments ignored, so the list can be annotated.
mapfile -t APPS < <(grep -vE '^\s*(#|$)' "$APPS_FILE")
echo "${#APPS[@]} app(s) from $APPS_FILE · plan=$PLAN · region=$REGION"
[ "$APPLY" = "1" ] || echo "DRY RUN — set APPLY=1 to provision. Nothing is created below."
echo

for app in "${APPS[@]}"; do
  # Neon resource names must be unique per account; the Vercel project name is
  # already unique, so reuse it rather than inventing a second naming scheme.
  db="${app}-db"
  cmd=(vercel integration add neon
       --name "$db"
       --plan "$PLAN"
       --metadata "region=$REGION"
       -e production -e preview -e development)

  echo "── $app  →  Neon project '$db'"
  if [ "$APPLY" = "1" ]; then
    # --cwd keeps this working from the repo root without cd-ing around, and
    # links the resource to THIS app rather than whatever was last linked.
    ( vercel link --yes --project "$app" >/dev/null && "${cmd[@]}" ) \
      || { echo "   FAILED for $app — stopping so a half-done run is obvious"; exit 1; }
    vercel env pull ".env.$app.local" >/dev/null 2>&1 \
      && echo "   DATABASE_URL pulled → .env.$app.local (gitignored — do not commit)"
  else
    printf '   vercel link --yes --project %s && %s\n' "$app" "${cmd[*]}"
  fi
done

echo
echo "Done. Verify with:  vercel integration open neon"
