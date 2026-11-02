import { PrismaClient } from "@prisma/client";
import { seal, unseal } from "./secret-box";

// Secret columns are encrypted on the way in and decrypted on the way out (lib/secret-box.ts), so the rest of
// the code reads and writes them as plain strings. Applies to top-level writes; reads include nested relations.
const SECRET_FIELDS = {
  client: ["waToken", "sheetHookSecret"],
  whatsAppNumber: ["token"],
  setting: ["wahaApiKey"],
} as const;

type Data = Record<string, unknown> | undefined;

function sealData(fields: readonly string[], data: Data | Data[]) {
  if (!data) return;
  for (const row of Array.isArray(data) ? data : [data]) {
    if (!row) continue;
    for (const f of fields) {
      const v = row[f];
      if (typeof v === "string") row[f] = seal(v);
      else if (v && typeof v === "object" && "set" in v && typeof (v as { set: unknown }).set === "string") (v as { set: string | null | undefined }).set = seal((v as { set: string }).set);
    }
  }
}

function sealArgs(fields: readonly string[], operation: string, args: Record<string, unknown>) {
  if (operation === "upsert") {
    sealData(fields, args.create as Data);
    sealData(fields, args.update as Data);
  } else if (["create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn"].includes(operation)) {
    sealData(fields, args.data as Data | Data[]);
  }
}

// Neon closes idle connections and wakes from sleep slowly; the first query after that fails with a
// connection error even though the database is fine. Reads are retried (twice, briefly); writes never
// are, so nothing can be applied twice.
const READS = new Set(["findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany", "count", "aggregate", "groupBy", "$queryRaw", "$queryRawUnsafe"]);
const TRANSIENT = new Set(["P1001", "P1002", "P1008", "P1017", "P2024"]);
const isTransient = (e: unknown) => {
  const err = e as { code?: string; errorCode?: string; message?: string };
  const code = err?.code ?? err?.errorCode;
  return (code && TRANSIENT.has(code)) || /Server has closed the connection|Can't reach database server|Connection terminated|ECONNRESET/i.test(err?.message ?? "");
};

function getEffectiveDbUrl(): string | undefined {
  const newDbUrl =
    process.env.NEW_DATABASE_DATABASE_URL ||
    process.env.NEW_DATABASE_POSTGRES_PRISMA_URL ||
    process.env.NEW_DATABASE_POSTGRES_URL;

  if (newDbUrl && (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes("ep-small-resonance"))) {
    process.env.DATABASE_URL = newDbUrl;
    return newDbUrl;
  }
  return process.env.DATABASE_URL;
}

/**
 * Prisma opens 2 connections per CPU + 1 (about 5 on a live function), so a page that reads 30 to 60 things at once
 * waits in line for a connection. Through Neon's pooler (thousands of connections allowed) a function may use 10.
 * A connection_limit already in the address is kept, and a direct (non-pooler) address is left as it is.
 */
export function withPoolSize(url: string | undefined, size = 10): string | undefined {
  if (!url || !/-pooler\./.test(url) || /[?&]connection_limit=/.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}connection_limit=${size}`;
}

function makeClient() {
  const url = withPoolSize(getEffectiveDbUrl());
  return new PrismaClient(url ? { datasources: { db: { url } } } : undefined)
    .$extends({
      query: {
        async $allOperations({ model, operation, args, query }) {
          // DB_TIMING=1 (QA speed checks only): each call's start and end, to see which ones wait on each other.
          if (process.env.DB_TIMING === "1") {
            const t0 = performance.now();
            try {
              return await query(args);
            } finally {
              console.log(`[db] ${t0.toFixed(0)} +${(performance.now() - t0).toFixed(0)}ms ${model ?? ""}.${operation}`);
            }
          }
          if (!READS.has(operation)) return query(args);
          for (let attempt = 0; ; attempt++) {
            try {
              return await query(args);
            } catch (e) {
              if (attempt >= 2 || !isTransient(e)) throw e;
              await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
            }
          }
        },
      },
    })
    .$extends({
      query: {
        client: {
          $allOperations({ operation, args, query }) {
            sealArgs(SECRET_FIELDS.client, operation, args as Record<string, unknown>);
            return query(args);
          },
        },
        whatsAppNumber: {
          $allOperations({ operation, args, query }) {
            sealArgs(SECRET_FIELDS.whatsAppNumber, operation, args as Record<string, unknown>);
            return query(args);
          },
        },
        setting: {
          $allOperations({ operation, args, query }) {
            sealArgs(SECRET_FIELDS.setting, operation, args as Record<string, unknown>);
            return query(args);
          },
        },
      },
    })
    .$extends({
      result: {
        client: {
          waToken: { needs: { waToken: true }, compute: (c) => unseal(c.waToken) },
          sheetHookSecret: { needs: { sheetHookSecret: true }, compute: (c) => unseal(c.sheetHookSecret) },
        },
        whatsAppNumber: {
          token: { needs: { token: true }, compute: (n) => unseal(n.token) },
        },
        setting: {
          wahaApiKey: { needs: { wahaApiKey: true }, compute: (s) => unseal(s.wahaApiKey) },
        },
      },
    });
}

type Db = ReturnType<typeof makeClient>;
const globalForPrisma = globalThis as unknown as { prisma?: Db };

export const db = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
