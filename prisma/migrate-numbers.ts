import { PrismaClient } from "@prisma/client";

// One-off: moves each client's single WhatsApp number (Client.waPhoneNumberId) into the
// WhatsAppNumber table as its default, tags the client's Meta templates with that account,
// and credits earlier Meta sends to the number. Safe to run twice.
const db = new PrismaClient();

async function main() {
  const clients = await db.client.findMany({ where: { waPhoneNumberId: { not: null }, waBusinessAccountId: { not: null } } });
  for (const c of clients) {
    const phoneNumberId = c.waPhoneNumberId!;
    const businessAccountId = c.waBusinessAccountId!;
    let display: { display_phone_number?: string; verified_name?: string } = {};
    if (c.waToken) {
      const r = await fetch(`https://graph.facebook.com/v23.0/${phoneNumberId}?fields=display_phone_number,verified_name`, {
        headers: { Authorization: `Bearer ${c.waToken}` },
      });
      display = await r.json();
    }
    const test = display.verified_name === "Test Number";
    const number = await db.whatsAppNumber.upsert({
      where: { phoneNumberId },
      update: {},
      create: {
        clientId: c.id, phoneNumberId, businessAccountId, isDefault: true,
        label: test ? "Test number" : "Main",
        displayPhone: display.display_phone_number ?? null, verifiedName: display.verified_name ?? null,
      },
    });
    const t = await db.template.updateMany({ where: { clientId: c.id, metaId: { not: null }, businessAccountId: null }, data: { businessAccountId } });
    const m = await db.message.updateMany({ where: { customer: { clientId: c.id }, provider: "META", simulated: false, senderId: null }, data: { senderId: number.id } });
    console.log(c.name, { number: `${number.label} ${number.displayPhone}`, templatesTagged: t.count, messagesCredited: m.count });
  }
}

main().finally(() => db.$disconnect());
