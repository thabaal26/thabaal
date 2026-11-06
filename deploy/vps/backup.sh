#!/bin/bash
# Nightly database backup (root's cron, /etc/cron.d/thabaal). Keeps 7 here; if /etc/thabaal-backup.conf names an rclone
# remote (REMOTE=r2crypt:thabaal-backups), also copies there and keeps 30 days. Use an rclone "crypt" remote: dumps hold
# customers' data. The outcome goes to /var/backups/thabaal/last-backup for the health check.
set -euo pipefail
DIR=/var/backups/thabaal
DB=thabaal
KEEP=7
OFFSITE_DAYS=30
STATUS="$DIR/last-backup"
REMOTE=""
[ -f /etc/thabaal-backup.conf ] && . /etc/thabaal-backup.conf

mkdir -p "$DIR"
chmod 700 "$DIR"
fail() { echo "FAILED $(date -u +%FT%TZ) $1" > "$STATUS"; echo "backup: $1" >&2; exit 1; }

FILE="$DIR/$DB-$(date -u +%Y%m%d-%H%M%S).dump"
trap 'rm -f "$FILE.tmp"' EXIT
sudo -u postgres pg_dump -Fc --no-owner --no-privileges "$DB" > "$FILE.tmp" || fail "pg_dump failed"
pg_restore --list "$FILE.tmp" >/dev/null || fail "dump is not readable"
mv "$FILE.tmp" "$FILE"
chmod 600 "$FILE"

ls -1t "$DIR"/"$DB"-*.dump | tail -n +$((KEEP + 1)) | xargs -r rm -f

OFFSITE=no
if [ -n "$REMOTE" ]; then
  rclone copyto "$FILE" "$REMOTE/$(basename "$FILE")" || fail "offsite copy failed"
  rclone delete --min-age "${OFFSITE_DAYS}d" "$REMOTE" || true
  OFFSITE=yes
fi
echo "OK $(date -u +%FT%TZ) size=$(du -h "$FILE" | cut -f1) offsite=$OFFSITE" > "$STATUS"
cat "$STATUS"
