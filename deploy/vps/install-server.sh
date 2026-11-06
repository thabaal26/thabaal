#!/bin/bash
# Installs the deploy and backup pieces on the VPS; safe to run again. As root, from a copy of deploy/vps:
#   bash install-server.sh
# On a first run it creates the app database and a TEST shared/.env (random values, no real keys, no WhatsApp token).
# Production keys replace that file at the switch; see README.md.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT=/srv/thabaal

install -d -o thabaal -g thabaal -m 750 "$ROOT" "$ROOT/releases" "$ROOT/shared" "$ROOT/shared/prisma-data" "$ROOT/logs"
install -d -o root -g thabaal -m 750 "$ROOT/bin"
install -o root -g thabaal -m 750 "$HERE/deploy-receive.sh" "$ROOT/bin/deploy-receive.sh"
install -o root -g thabaal -m 640 "$HERE/ecosystem.config.cjs" "$ROOT/bin/ecosystem.config.cjs"
install -o root -g root -m 750 "$HERE/backup.sh" /usr/local/sbin/thabaal-backup
install -o root -g root -m 750 "$HERE/restore-test.sh" /usr/local/sbin/thabaal-restore-test
install -o root -g root -m 750 "$HERE/set-keys.sh" /usr/local/sbin/thabaal-set-keys
install -o root -g root -m 644 "$HERE/Caddyfile.production" /etc/caddy/Caddyfile.production

# 21:00 UTC is 02:30 in India. Sunday's restore test runs an hour after that night's backup.
cat > /etc/cron.d/thabaal <<'CRON'
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
0 21 * * * root /usr/local/sbin/thabaal-backup >> /var/log/thabaal-backup.log 2>&1
0 22 * * 0 root /usr/local/sbin/thabaal-restore-test >> /var/log/thabaal-backup.log 2>&1
CRON
chmod 644 /etc/cron.d/thabaal

cat > /etc/logrotate.d/thabaal <<'ROTATE'
/srv/thabaal/logs/*.log /var/log/thabaal-backup.log {
	weekly
	rotate 8
	compress
	missingok
	notifempty
	copytruncate
}
ROTATE

if ! sudo -u postgres psql -Atc "select 1 from pg_roles where rolname='thabaal'" | grep -q 1; then
  PW=$(openssl rand -hex 24)
  sudo -u postgres psql -q -v ON_ERROR_STOP=1 <<SQL
CREATE ROLE thabaal LOGIN PASSWORD '$PW';
CREATE DATABASE thabaal OWNER thabaal ENCODING 'UTF8' TEMPLATE template0;
SQL
  if [ ! -f "$ROOT/shared/.env" ]; then
    umask 077
    cat > "$ROOT/shared/.env" <<ENV
# TEST values, not production. Replaced with the real keys at the switch.
DATABASE_URL=postgresql://thabaal:$PW@127.0.0.1:5432/thabaal?connection_limit=20&pool_timeout=20
DATABASE_URL_UNPOOLED=postgresql://thabaal:$PW@127.0.0.1:5432/thabaal
AUTH_SECRET=$(openssl rand -hex 32)
CRON_SECRET=$(openssl rand -hex 24)
DATA_ENC_KEY=$(openssl rand -base64 32)
META_APP_SECRET=$(openssl rand -hex 24)
WHATSAPP_WEBHOOK_VERIFY_TOKEN=$(openssl rand -hex 16)
THABAAL_QA=1
APP_TIMEZONE=Asia/Kolkata
DEFAULT_COUNTRY_CODE=91
META_GRAPH_VERSION=v21.0
ENV
    chown thabaal:thabaal "$ROOT/shared/.env"
    chmod 600 "$ROOT/shared/.env"
  fi
  unset PW
fi
echo "install-server: done"
