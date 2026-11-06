#!/bin/bash
# Packs a standalone build (BUILD_STANDALONE=1 npx next build) into a release: bash deploy/vps/package-release.sh out.tar.gz
set -euo pipefail
OUT="${1:?usage: package-release.sh out.tar.gz}"
[ -f .next/standalone/server.js ] || { echo "no standalone build; run BUILD_STANDALONE=1 npx next build first" >&2; exit 1; }

STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
cp -a .next/standalone/. "$STAGE/"
mkdir -p "$STAGE/.next" "$STAGE/prisma"
cp -a .next/static "$STAGE/.next/static"
cp -a public "$STAGE/public"
cp -a prisma/sql "$STAGE/prisma/sql"
node scripts/db-additive.mjs --list > "$STAGE/.additive-files"

# Never ship secrets or local data, whatever the build folder picked up.
rm -f "$STAGE"/.env*
rm -rf "$STAGE/prisma/data" "$STAGE/private-data"

tar -czf "$OUT" -C "$STAGE" .
du -h "$OUT"
