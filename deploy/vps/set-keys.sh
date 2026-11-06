#!/bin/bash
# Fills the keys still missing from shared/.env.live, typed or pasted without showing them. As root, over `ssh -t`:
#   /usr/local/sbin/thabaal-set-keys
# Enter skips a key; run it again for the rest. It only writes .env.live, so the running app isn't touched.
set -euo pipefail
FILE=/srv/thabaal/shared/.env.live
LIST=/srv/thabaal/shared/.env.live.missing
[ -f "$FILE" ] || { echo "$FILE is missing"; exit 1; }
[ -s "$LIST" ] || { echo "No keys are missing."; exit 0; }

for k in $(cat "$LIST"); do
  read -rsp "$k (Enter to skip): " v </dev/tty
  echo
  [ -n "$v" ] || continue
  KEY="$k" VAL="$v" node -e '
    const fs = require("fs");
    const f = process.argv[1];
    const lines = fs.readFileSync(f, "utf8").split("\n").filter((l) => l && !l.startsWith(process.env.KEY + "="));
    lines.push(process.env.KEY + "=" + JSON.stringify(process.env.VAL.trim()));
    fs.writeFileSync(f, lines.join("\n") + "\n", { mode: 0o600 });
  ' "$FILE"
  sed -i "/^$k\$/d" "$LIST"
  unset v
  echo "  saved"
done
chown thabaal:thabaal "$FILE"
chmod 600 "$FILE"

if [ -s "$LIST" ]; then
  echo "Still missing: $(tr '\n' ' ' < "$LIST")"
else
  echo "All keys are in. Nothing is active yet."
fi
