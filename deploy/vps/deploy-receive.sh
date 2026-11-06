#!/bin/bash
# Receives a release from GitHub Actions and switches to it. The deploy key may run only this script (authorized_keys
# has command="...",restrict), so a leaked key can ship a release but can't open a shell. Runs as the thabaal user.
#   tar.gz on stdin, the commit id as the SSH command.
# Order: unpack -> additive SQL -> switch -> health check -> on failure, back to the previous release.
set -euo pipefail
export PATH=/usr/local/bin:/usr/bin:/bin

ROOT=/srv/thabaal
ECOSYSTEM="$ROOT/bin/ecosystem.config.cjs"
KEEP=3
MAX_BYTES=1500000000
SHA="${SSH_ORIGINAL_COMMAND:-${1:-}}"

[[ "$SHA" =~ ^[0-9a-f]{7,40}$ ]] || { echo "deploy: expected a commit id" >&2; exit 2; }
[ -f "$ROOT/shared/.env" ] || { echo "deploy: $ROOT/shared/.env is missing" >&2; exit 2; }
cd "$ROOT"

exec 9>"$ROOT/deploy.lock"
flock -n 9 || { echo "deploy: another deploy is running" >&2; exit 3; }

REL="$ROOT/releases/$(date -u +%Y%m%d%H%M%S)-${SHA:0:12}"
mkdir -p "$REL"
SWITCHED=0
cleanup() { [ "$SWITCHED" = 1 ] || rm -rf "$REL"; }
trap cleanup EXIT

head -c "$MAX_BYTES" | tar -xz -C "$REL"
[ -f "$REL/server.js" ] || { echo "deploy: release has no server.js" >&2; exit 4; }
rm -f "$REL"/.env*

# Files the app writes must outlive a release.
mkdir -p "$REL/prisma" "$ROOT/shared/prisma-data"
rm -rf "$REL/prisma/data"
ln -s "$ROOT/shared/prisma-data" "$REL/prisma/data"

# The same additive SQL Vercel's build ran (scripts/db-additive.mjs). Each file is safe to run again; a failure stops
# the deploy before the new code goes live.
DB_URL=$(grep -E '^DATABASE_URL_UNPOOLED=' "$ROOT/shared/.env" | head -1 | cut -d= -f2- | tr -d '"')
[ -n "$DB_URL" ] || { echo "deploy: DATABASE_URL_UNPOOLED is not set" >&2; exit 4; }
if [ -f "$REL/.additive-files" ]; then
  while read -r f; do
    [ -n "$f" ] || continue
    PGOPTIONS='--client-min-messages=warning' psql "$DB_URL" -q -v ON_ERROR_STOP=1 -f "$REL/$f" >/dev/null
  done < "$REL/.additive-files"
  echo "deploy: additive SQL done"
fi

healthy() {
  local i
  for i in $(seq 1 45); do
    curl -fsS -m 3 http://127.0.0.1:3000/api/health >/dev/null 2>&1 && return 0
    sleep 2
  done
  return 1
}
start_current() {
  pm2 delete thabaal >/dev/null 2>&1 || true
  pm2 start "$ECOSYSTEM" >/dev/null
}

PREV=$(readlink -f "$ROOT/current" 2>/dev/null || true)
ln -sfn "$REL" "$ROOT/current.new"
mv -Tf "$ROOT/current.new" "$ROOT/current"
SWITCHED=1
start_current

if ! healthy; then
  echo "deploy: new release is not healthy" >&2
  pm2 logs thabaal --nostream --lines 30 >&2 || true
  if [ -n "$PREV" ] && [ -d "$PREV" ]; then
    ln -sfn "$PREV" "$ROOT/current.new"
    mv -Tf "$ROOT/current.new" "$ROOT/current"
    start_current
    healthy && echo "deploy: back on $(basename "$PREV")" >&2 || echo "deploy: previous release is not healthy either" >&2
    pm2 save --force >/dev/null
  fi
  rm -rf "$REL"
  exit 5
fi
pm2 save --force >/dev/null

# Old releases, keeping the running one.
RUNNING=$(readlink -f "$ROOT/current")
ls -1dt "$ROOT"/releases/* | tail -n +$((KEEP + 1)) | while read -r old; do
  [ "$old" = "$RUNNING" ] || rm -rf "$old"
done
echo "deploy: live on $(basename "$REL")"
