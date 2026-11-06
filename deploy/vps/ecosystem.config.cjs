// PM2's description of the app. One process: the VPS has one CPU. The secrets stay in shared/.env, read by Node itself.
module.exports = {
  apps: [
    {
      name: "thabaal",
      cwd: "/srv/thabaal/current",
      script: "server.js",
      node_args: "--env-file=/srv/thabaal/shared/.env --max-old-space-size=1536",
      env: { NODE_ENV: "production", PORT: "3000", HOSTNAME: "127.0.0.1", NEXT_TELEMETRY_DISABLED: "1" },
      max_memory_restart: "1800M",
      kill_timeout: 10000,
      exp_backoff_restart_delay: 200,
      time: true,
      out_file: "/srv/thabaal/logs/app.log",
      error_file: "/srv/thabaal/logs/app-error.log",
    },
  ],
};
