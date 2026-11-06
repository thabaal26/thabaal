# Thabaal on the VPS

One Hostinger VPS (Ubuntu) runs the app (PM2, user `thabaal`), PostgreSQL (local only) and Caddy (HTTPS).

| What | Where |
| --- | --- |
| Releases, and the running one | `/srv/thabaal/releases/`, `/srv/thabaal/current` |
| Secrets | `/srv/thabaal/shared/.env` (never in git, in a release or in a backup) |
| App logs | `/srv/thabaal/logs/` |
| Backups, and their last results | `/var/backups/thabaal/` (`last-backup`, `last-restore-test`) |
| Backup and restore-test schedule | `/etc/cron.d/thabaal`, log in `/var/log/thabaal-backup.log` |

## Offsite backups

Each night's dump is also copied, encrypted, to Google Drive with rclone (`/etc/thabaal-backup.conf`: `REMOTE=gcrypt:daily`;
30 days kept). The Drive login has access only to files rclone itself made. Without the password in
`/root/thabaal-backup-password` these copies can't be read, so keep that password outside this server too.

Google limits rclone's shared login, so uploads can be slow; one small file a night is fine. If that ever fails,
`last-backup` says FAILED and the local copies still exist.

Restore from Drive: `rclone copyto gcrypt:daily/<name>.dump /root/<name>.dump`. On a new server, set up the `gcrypt`
remote again with that password (`rclone config create gcrypt crypt remote gdrive:thabaal-backups ...`).

## Alerts

`thabaal-health` runs every 5 minutes: app, PostgreSQL, Caddy, disk, memory, backup, restore test, certificate. It emails
the address in `/etc/thabaal-alert.conf` once when something breaks, daily while it stays broken, and once when fixed.
`thabaal-health --test` sends a test email.

## Deploys

A push to `main` builds in GitHub Actions (`.github/workflows/deploy-vps.yml`) and sends the release to the server, which
applies the additive SQL, switches, waits for `/api/health` and goes back to the previous release if that fails.

To turn it on, in the repository's Settings > Secrets and variables > Actions:

- Secret `VPS_DEPLOY_KEY`: the private half of the deploy key. Its public half is in `~thabaal/.ssh/authorized_keys`,
  starting `command="/srv/thabaal/bin/deploy-receive.sh",restrict`, so it can do nothing but ship a release.
- Variable `VPS_DEPLOY` = `on`.
- Variables `NEXT_PUBLIC_*`, only those set on Vercel. They are fixed at build time.

After changing anything in `deploy/vps`, copy it to the server and run `install-server.sh` as root again.

## Switching from Vercel

Order matters. Until step 6 the live site must stay the only one with real keys **and** a running scheduler, or
customers could get a campaign twice.

1. Set the real keys in `shared/.env`: copy every Vercel variable, keep this server's two `DATABASE_URL` lines, remove
   `THABAAL_QA`, add `THABAAL_ENV=production`. `DATA_ENC_KEY` must be the same as Vercel's, or saved WhatsApp tokens
   can't be read. Keep a copy of this file somewhere safe: backups don't contain it.
2. Lower the DNS TTL for `thabaal.in` and `www` a day before.
3. Pause campaigns and take a test copy of the live database. Restore it here, try it, and time it.
4. In a quiet hour, with campaigns paused and new work stopped: `pg_dump` the live database, then here
   `dropdb thabaal`, `createdb -O thabaal thabaal`, `pg_restore --no-owner --role=thabaal -d thabaal`.
5. `pm2 restart thabaal`, run `thabaal-backup`, and check it.
6. Point the DNS here. `cp /etc/caddy/Caddyfile.production /etc/caddy/Caddyfile && systemctl reload caddy`. The scheduler
   workflow calls `APP_URL`, so it follows the domain; check `APP_URL` is `https://www.thabaal.in`.
7. Check login, Chats, a webhook and a small send, then keep Vercel idle for a week before removing it.

Files on Vercel Blob keep working from their own addresses while that store exists; move them before closing it.

## When something breaks

```bash
sudo -u thabaal -H bash -c 'cd /srv/thabaal && pm2 status && pm2 logs thabaal --lines 50 --nostream'
curl -s http://127.0.0.1:3000/api/health
systemctl status postgresql caddy --no-pager
free -m; df -h /
cat /var/backups/thabaal/last-backup /var/backups/thabaal/last-restore-test
```

Go back one release: point `current` at the older folder in `releases/`, then, as `thabaal` from `/srv/thabaal`,
`pm2 delete thabaal; pm2 start bin/ecosystem.config.cjs; pm2 save`.

Restore a backup: stop the app, `dropdb thabaal`, `createdb -O thabaal thabaal`,
`sudo -u postgres pg_restore --no-owner --role=thabaal -d thabaal < file.dump`, start the app. Then deploy again, which
re-applies the additive SQL.

Locked out of SSH: hPanel's Emergency mode for this VPS.
