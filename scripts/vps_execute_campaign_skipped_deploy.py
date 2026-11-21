import subprocess
import sys
import os

key_path = r"C:\Users\step1\.ssh\thabaal_vps"
target_sha = "f2ff4778b5fc48add44ae94b3329a80279c4a78f"

remote_script = f"""
set -euo pipefail

echo "========================================================"
echo "THABAAL VPS CAMPAIGN SKIPPED REPORTING & AUDIENCE REFRESH DEPLOYMENT"
echo "Commit: {target_sha}"
echo "========================================================"

# --- GATE 1: GIT FETCH & PROVENANCE ---
echo ">>> [GATE 1] Ensuring build repository ownership..."
chown -R thabaal:thabaal /srv/thabaal/build

echo ">>> [GATE 1] Updating build repository to {target_sha}..."
cd /srv/thabaal/build/repo
sudo -u thabaal git fetch origin HomeNewUi
sudo -u thabaal git checkout {target_sha}

RESOLVED_SHA=$(sudo -u thabaal git rev-parse HEAD)
echo "Resolved SHA: $RESOLVED_SHA"
if [ "$RESOLVED_SHA" != "{target_sha}" ]; then
    echo "FATAL: Resolved SHA mismatch! Expected {target_sha}"
    exit 1
fi

GIT_STATUS=$(sudo -u thabaal git status --short)
if [ -n "$GIT_STATUS" ]; then
    echo "FATAL: Build repository working tree is not clean:"
    echo "$GIT_STATUS"
    exit 1
fi
echo "Gate 1 PASSED: Provenance verified."

# --- GATE 1.5: STANDALONE BUILD ---
OUT="/srv/thabaal/build/release-f2ff477.tar.gz"
echo ">>> [GATE 1.5] Executing Next.js standalone build with production variables..."
sudo -u thabaal env \
    BUILD_STANDALONE=1 \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_GOOGLE_ADS_ID="AW-18580810849" \
    NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL="qHQ6CNfFkrwdEOHYgpxF" \
    NODE_OPTIONS="--max-old-space-size=2048" \
    npm run build

echo ">>> [GATE 1.5] Staging release package..."
rm -f "$OUT"

STAGE=$(mktemp -d /srv/thabaal/build/stage.XXXXXX)
cleanup() {{ rm -rf "$STAGE"; }}
trap cleanup EXIT

cp -a .next/standalone/. "$STAGE/"
mkdir -p "$STAGE/.next" "$STAGE/prisma" "$STAGE/scripts"
cp -a .next/static "$STAGE/.next/static"
cp -a public "$STAGE/public"
cp -a prisma/schema.prisma "$STAGE/prisma/schema.prisma"
if [ -d prisma/sql ]; then
    cp -a prisma/sql "$STAGE/prisma/sql"
fi

if [ -f scripts/db-additive.mjs ]; then
    cp -a scripts/db-additive.mjs "$STAGE/scripts/db-additive.mjs"
    node scripts/db-additive.mjs --list > "$STAGE/.additive-files"
fi

if [ -f scripts/verify-schema-drift.mjs ]; then
    cp -a scripts/verify-schema-drift.mjs "$STAGE/scripts/verify-schema-drift.mjs"
fi

# Assert standalone server.js exists
if [ ! -f "$STAGE/server.js" ]; then
    echo "FATAL: $STAGE/server.js missing! Standalone build failed."
    exit 1
fi

# Ensure no local secrets or data
rm -f "$STAGE"/.env*
rm -rf "$STAGE/prisma/data" "$STAGE/private-data"

echo ">>> [GATE 1.5] Packaging release tarball..."
tar -czf "$OUT" -C "$STAGE" .
chown thabaal:thabaal "$OUT"
ls -lh "$OUT"
sha256sum "$OUT" > "${{OUT}}.sha256"
cat "${{OUT}}.sha256"
echo "Gate 1.5 PASSED: Build package ready."

# --- GATE 2: PRODUCTION DATABASE BACKUP ---
echo ">>> [GATE 2] Taking binary backup of production database thabaal..."
TS=$(date -u +%Y%m%d%H%M%S)
BACKUP_FILE="/srv/thabaal/backups/pre-campaign-skipped-${{TS}}.dump"
sudo -u postgres pg_dump -Fc -d thabaal > "$BACKUP_FILE"

# Verify backup using table of contents
sudo -u postgres pg_restore --list < "$BACKUP_FILE" > "${{BACKUP_FILE}}.toc"
if [ ! -s "${{BACKUP_FILE}}.toc" ]; then
    echo "FATAL: Backup TOC is empty! Backup failed."
    exit 1
fi
echo "Backup TOC verified (first 5 items):"
head -n 5 "${{BACKUP_FILE}}.toc"
sha256sum "$BACKUP_FILE" > "${{BACKUP_FILE}}.sha256"
ls -lh "$BACKUP_FILE"
echo "Gate 2 PASSED: Production backup verified."

# --- GATE 3: DEPLOYMENT RECEIVER WITH SCHEMA DRIFT GATE ---
echo ">>> [GATE 3] Promoting release via certified deployment receiver..."
sudo -u thabaal /srv/thabaal/bin/deploy-receive.sh {target_sha} < "$OUT"
echo "Gate 3 PASSED: Deployment receiver promoted release."

# --- GATE 4: POST-DEPLOYMENT VERIFICATION ---
echo ">>> [GATE 4] Executing post-deployment health and boundary checks..."
CURRENT_REL=$(readlink -f /srv/thabaal/current)
echo "Active Symlink Target: $CURRENT_REL"

sudo -u thabaal pm2 status thabaal

echo -n "Internal Health Check: "
curl -fsS --max-time 10 http://127.0.0.1:3000/api/health
echo

echo -n "Public Health Check: "
curl -fsS --max-time 15 https://www.thabaal.in/api/health
echo

echo "========================================================"
echo "DEPLOYMENT COMPLETED SUCCESSFULLY!"
echo "========================================================"
"""

ssh_cmd = [
    "ssh", "-i", key_path, "root@189.72.145.225",
    "bash"
]

print(f"Starting deployment of {target_sha} to VPS...")
clean_script = remote_script.replace("\r\n", "\n").encode("utf-8")
p = subprocess.run(ssh_cmd, input=clean_script, capture_output=True)
print("STDOUT:\n" + p.stdout.decode("utf-8", errors="replace"))
if p.stderr:
    print("STDERR:\n" + p.stderr.decode("utf-8", errors="replace"))
sys.exit(p.returncode)
