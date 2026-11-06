#!/bin/bash
# Server health, every 5 minutes from root's cron. Emails once when something goes wrong, again each day it stays wrong,
# and once when it's fixed. Settings are in /etc/thabaal-alert.conf (ALERT_TO, RESEND_API_KEY, RESEND_FROM).
#   thabaal-health           run the checks
#   thabaal-health --test    send a test email
# ALERT_DRY=1 prints the emails instead of sending them.
set -u
CONF=/etc/thabaal-alert.conf
STATE=/var/lib/thabaal-health
BACKUPS=/var/backups/thabaal
REPEAT_SECONDS=86400
mkdir -p "$STATE"
chmod 700 "$STATE"

send() { # subject, body
  if [ "${ALERT_DRY:-}" = 1 ]; then echo "EMAIL: $1 | $2"; return 0; fi
  [ -f "$CONF" ] || { echo "health: $CONF is missing" >&2; return 1; }
  SUBJECT="$1" BODY="$2" node -e '
    const fs = require("fs"), util = require("util");
    const c = util.parseEnv(fs.readFileSync(process.argv[1], "utf8"));
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + c.RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ from: c.RESEND_FROM, to: [c.ALERT_TO], subject: process.env.SUBJECT, text: process.env.BODY }),
      signal: AbortSignal.timeout(20000),
    }).then(async (r) => {
      if (!r.ok) { console.error("health: email refused, status " + r.status); process.exit(1); }
    }).catch((e) => { console.error("health: email failed: " + e.message); process.exit(1); });
  ' "$CONF"
}

if [ "${1:-}" = "--test" ]; then
  send "Thabaal server: test alert" "This is a test from $(hostname). Alerts for the Thabaal server come to this address."
  exit $?
fi

# Records one check. Empty message = fine.
report() { # name, message
  local name="$1" msg="$2" f="$STATE/$1" now last
  now=$(date +%s)
  if [ -n "$msg" ]; then
    last=$(cut -d' ' -f1 "$f" 2>/dev/null || echo 0)
    if [ ! -f "$f" ]; then
      send "Thabaal server: $name problem" "$msg" && echo "$now" > "$f"
    elif [ $((now - last)) -ge "$REPEAT_SECONDS" ]; then
      send "Thabaal server: $name still has a problem" "$msg" && echo "$now" > "$f"
    fi
  elif [ -f "$f" ]; then
    send "Thabaal server: $name fixed" "$name is fine again." && rm -f "$f"
  fi
}

# Given a few tries, so a deploy's quick restart doesn't count as down.
app_ok() {
  local i
  for i in 1 2 3 4; do
    curl -fsS -m 5 http://127.0.0.1:3000/api/health >/dev/null 2>&1 && return 0
    sleep 10
  done
  return 1
}
app_ok && report app "" || report app "The app isn't answering /api/health. Check: pm2 status, /srv/thabaal/logs/app-error.log"

SERVICE_DOWN=""
for s in postgresql caddy; do
  systemctl is-active --quiet "$s" || SERVICE_DOWN="$SERVICE_DOWN $s"
done
report services "${SERVICE_DOWN:+Not running:$SERVICE_DOWN}"

DISK=$(df --output=pcent / | tail -1 | tr -dc 0-9)
[ "$DISK" -ge 85 ] && report disk "Disk is $DISK% full." || report disk ""

MEM_FREE=$(awk '/MemTotal/{t=$2}/MemAvailable/{a=$2}END{print int(a*100/t)}' /proc/meminfo)
SWAP_USED=$(awk '/SwapTotal/{t=$2}/SwapFree/{f=$2}END{print t?int((t-f)*100/t):0}' /proc/meminfo)
if [ "$MEM_FREE" -lt 10 ] || [ "$SWAP_USED" -ge 50 ]; then
  report memory "Memory is tight: $MEM_FREE% free, swap $SWAP_USED% used. Time to look at a bigger plan."
else
  report memory ""
fi

age_hours() { echo $(( ($(date +%s) - $(stat -c %Y "$1")) / 3600 )); }

MSG=""
if [ ! -f "$BACKUPS/last-backup" ]; then MSG="No backup has run yet."
elif ! grep -q '^OK ' "$BACKUPS/last-backup"; then MSG="Last backup: $(cat "$BACKUPS/last-backup")"
elif [ "$(age_hours "$BACKUPS/last-backup")" -ge 26 ]; then MSG="The last backup is $(age_hours "$BACKUPS/last-backup") hours old."
elif [ -f /etc/thabaal-backup.conf ] && ! grep -q 'offsite=yes' "$BACKUPS/last-backup"; then MSG="Last backup didn't reach Google Drive."
fi
report backup "$MSG"

MSG=""
if [ -f "$BACKUPS/last-restore-test" ]; then
  if ! grep -q '^OK ' "$BACKUPS/last-restore-test"; then MSG="Last restore test: $(cat "$BACKUPS/last-restore-test")"
  elif [ "$(age_hours "$BACKUPS/last-restore-test")" -ge 200 ]; then MSG="The last restore test is over 8 days old."
  fi
fi
report restore-test "$MSG"

# Certificate, once this server is on the real domain.
MSG=""
if grep -q 'thabaal.in' /etc/caddy/Caddyfile 2>/dev/null; then
  END=$(echo | timeout 15 openssl s_client -servername www.thabaal.in -connect 127.0.0.1:443 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
  if [ -z "$END" ]; then MSG="Can't read the HTTPS certificate."
  else
    DAYS=$(( ($(date -d "$END" +%s) - $(date +%s)) / 86400 ))
    [ "$DAYS" -lt 14 ] && MSG="The HTTPS certificate ends in $DAYS days; Caddy should have renewed it."
  fi
fi
report certificate "$MSG"
