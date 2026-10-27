#!/usr/bin/env bash
# Pull + build + restart 9router on personal-server.
# Lives in the repo (committed) at /opt/9router/src/deploy.sh on the server.
# Data (/opt/9router/data) and /opt/9router/.env are never touched. No DB/file
# backups are made here by design.
#
# Usage: /opt/9router/src/deploy.sh [--force]   (--force = rebuild even if no new commits)
set -euo pipefail
export NVM_DIR=/root/.nvm; . "$NVM_DIR/nvm.sh" >/dev/null
export NEXT_TELEMETRY_DISABLED=1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

git fetch -q origin master
OLD=$(git rev-parse HEAD); NEW=$(git rev-parse origin/master)
if [ "$OLD" = "$NEW" ] && [ "${1:-}" != "--force" ]; then echo "up-to-date @ ${OLD:0:8}"; exit 0; fi
git diff --quiet || { echo "working tree dirty, abort"; git status -s; exit 1; }

git merge --ff-only origin/master
git log --oneline "$OLD..HEAD" | head -20
git diff --name-only "$OLD" HEAD | grep -q "^package.json$" && npm install --no-audit --no-fund || echo "package.json unchanged, skip npm install"
npm run build

# Fresh process instead of an in-place restart: drop the old process and the
# saved pm2 dump so no stale state (env, resurrect list) carries over, then
# start clean from the committed ecosystem file (which re-reads /opt/9router/.env).
pm2 delete 9router >/dev/null 2>&1 || true
pm2 cleardump >/dev/null 2>&1 || true
pm2 start /opt/9router/ecosystem.config.cjs
pm2 save >/dev/null

for i in $(seq 1 30); do
  curl -fs -m3 http://127.0.0.1:20128/api/health >/dev/null && { echo "OK ${OLD:0:8} -> $(git rev-parse --short HEAD)"; exit 0; }
  sleep 2
done
echo "HEALTH FAIL. rollback: cd $SCRIPT_DIR && git reset --hard $OLD && npm run build && pm2 delete 9router && pm2 cleardump && pm2 start /opt/9router/ecosystem.config.cjs && pm2 save"; exit 1
