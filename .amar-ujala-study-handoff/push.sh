#!/bin/bash
# Publishes the Amar Ujala study page: fresh clone, branch, commit, push.
set -euo pipefail
H="$HOME/Anchit-Work-Portfolio/.amar-ujala-study-handoff"
W="$(mktemp -d)/portfolio"
git clone -q --depth 30 https://github.com/Anchit-AI-Hustle/Anchit-Work-Portfolio.git "$W"
cd "$W"
git checkout -q -b feat/amar-ujala-study
cp "$H/amar-ujala-study.html" .
git apply "$H/build-www.patch"
git add amar-ujala-study.html scripts/build-www.mjs
git commit -q -F "$H/commit-msg.txt"
git push -u origin feat/amar-ujala-study
echo "PUSHED $(git rev-parse --short HEAD)"
