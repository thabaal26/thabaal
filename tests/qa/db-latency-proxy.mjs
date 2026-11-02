// A TCP proxy in front of the QA database that adds a fixed delay each way, so page times on the QA app look like the
// live site's (functions and Neon in the same region: a few ms per database round trip). For measuring speed only.
//   node tests/qa/db-latency-proxy.mjs [listen=5435] [target=5434] [delayMs=2]
//   then: QA_APP_DB_PORT=5435 node tests/qa/serve.mjs
import net from "node:net";

const [listen = "5435", target = "5434", delay = "2"] = process.argv.slice(2);
const ms = Number(delay);
const later = (fn) => (ms > 0 ? setTimeout(fn, ms) : fn());

net
  .createServer((client) => {
    const server = net.connect(Number(target), "127.0.0.1");
    // Chunks keep their order: each one waits the same delay on its way through.
    client.on("data", (d) => later(() => server.write(d)));
    server.on("data", (d) => later(() => client.write(d)));
    const close = () => {
      client.destroy();
      server.destroy();
    };
    client.on("error", close);
    server.on("error", close);
    client.on("close", close);
    server.on("close", close);
  })
  .listen(Number(listen), "127.0.0.1", () => console.log(`db latency proxy :${listen} → :${target}, +${ms} ms each way`));
