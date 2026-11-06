#!/bin/bash
# Weekly proof that the newest backup can be restored (root's cron). Restores it into a throwaway database, checks the
# tables and rows are there, and always deletes that database. The outcome goes to /var/backups/thabaal/last-restore-test.
set -euo pipefail
DIR=/var/backups/thabaal
TEST_DB=thabaal_restore_test
STATUS="$DIR/last-restore-test"
fail() { echo "FAILED $(date -u +%FT%TZ) $1" > "$STATUS"; echo "restore-test: $1" >&2; exit 1; }
as_pg() { sudo -u postgres "$@"; }

FILE=$(ls -1t "$DIR"/thabaal-*.dump 2>/dev/null | head -1 || true)
[ -n "$FILE" ] || fail "no backup found"

drop() { as_pg dropdb --if-exists "$TEST_DB" >/dev/null 2>&1 || true; }
trap drop EXIT
drop
as_pg createdb "$TEST_DB" || fail "createdb failed"
# Piped in so the postgres user needs no access to root's backup folder.
as_pg pg_restore --no-owner --no-privileges --exit-on-error -d "$TEST_DB" < "$FILE" || fail "restore failed: $(basename "$FILE")"

count() { as_pg psql -d "$1" -Atc "$2"; }
TABLES_BACKUP=$(count "$TEST_DB" "select count(*) from information_schema.tables where table_schema='public'")
TABLES_LIVE=$(count thabaal "select count(*) from information_schema.tables where table_schema='public'")
[ "$TABLES_BACKUP" -gt 0 ] || fail "backup has no tables"
[ "$TABLES_BACKUP" = "$TABLES_LIVE" ] || fail "tables: backup $TABLES_BACKUP, live $TABLES_LIVE"

ROWS=""
for t in Client Customer Message Reply Order; do
  n=$(count "$TEST_DB" "select count(*) from \"$t\"") || fail "can't read $t"
  ROWS="$ROWS $t=$n"
done
echo "OK $(date -u +%FT%TZ) $(basename "$FILE") tables=$TABLES_BACKUP$ROWS" > "$STATUS"
cat "$STATUS"
