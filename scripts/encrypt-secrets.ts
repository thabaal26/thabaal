// One-off: encrypts tokens and keys still stored as plain text (lib/secret-box.ts). Safe to run again.
// Needs the same DATA_ENC_KEY as production. Run: npx tsx scripts/encrypt-secrets.ts [--dry]
import { PrismaClient } from "@prisma/client";
import { isSealed, seal, unseal } from "../src/lib/secret-box";

const raw = new PrismaClient();
const dry = process.argv.includes("--dry");

async function main() {
  if (!process.env.DATA_ENC_KEY) throw new Error("Set DATA_ENC_KEY first.");
  let done = 0;
  const fix = async (what: string, value: string | null, save: (v: string) => Promise<unknown>) => {
    if (!value || isSealed(value)) return;
    const sealed = seal(value)!;
    if (unseal(sealed) !== value) throw new Error(`Round trip failed for ${what}`);
    if (!dry) await save(sealed);
    done++;
    console.log(`${dry ? "would encrypt" : "encrypted"} ${what}`);
  };
  for (const c of await raw.client.findMany({ select: { id: true, name: true, waToken: true, sheetHookSecret: true } })) {
    await fix(`${c.name} access token`, c.waToken, (v) => raw.client.update({ where: { id: c.id }, data: { waToken: v } }));
    await fix(`${c.name} sheet secret`, c.sheetHookSecret, (v) => raw.client.update({ where: { id: c.id }, data: { sheetHookSecret: v } }));
  }
  for (const n of await raw.whatsAppNumber.findMany({ select: { id: true, label: true, token: true } })) {
    await fix(`number "${n.label}" token`, n.token, (v) => raw.whatsAppNumber.update({ where: { id: n.id }, data: { token: v } }));
  }
  for (const s of await raw.setting.findMany({ select: { id: true, wahaApiKey: true } })) {
    await fix("WAHA API key", s.wahaApiKey, (v) => raw.setting.update({ where: { id: s.id }, data: { wahaApiKey: v } }));
  }
  console.log(`${done} secret(s) ${dry ? "to encrypt" : "encrypted"}.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => raw.$disconnect());
