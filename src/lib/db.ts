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

function makeClient() {
  return new PrismaClient()
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
