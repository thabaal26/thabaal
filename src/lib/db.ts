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

function makeClient() {
  return new PrismaClient()
    .$extends({
      query: {
        async $allOperations({ operation, args, query }) {
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
