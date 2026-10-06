// Creates the admin login account. With --demo, also adds a demo client with sample customers, templates,
// a twice-weekly campaign and two weeks of message history.
//   npm run seed            (uses ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME)
//   npm run seed -- --demo
import { PrismaClient, type MessageStatus, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { computeNextRun } from "../src/lib/schedule";

try {
  process.loadEnvFile(); // local .env; on Vercel the variables are already set
} catch {}

const db = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!email || password.length < 8) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD (8+ characters) before seeding.");

  await db.user.upsert({
    where: { email },
    update: { passwordHash: await bcrypt.hash(password, 12), role: "ADMIN", clientId: null },
    create: { email, name: process.env.ADMIN_NAME ?? "Admin", role: "ADMIN", passwordHash: await bcrypt.hash(password, 12) },
  });
  console.log(`✓ Admin login ready for ${email}`);

  if (!process.argv.includes("--demo")) return;

  const { id: clientId } = await db.client.upsert({ where: { name: "Demo Café" }, update: {}, create: { name: "Demo Café" } });
  // Demo templates belong to the env-configured number, so they have no WhatsApp account.
  const templateOnce = async (name: string, data: Prisma.TemplateUncheckedCreateInput) =>
    (await db.template.findFirst({ where: { clientId, businessAccountId: null, name, language: "en" } })) ?? db.template.create({ data });

  const first = ["Priya", "Arjun", "Meena", "Rahul", "Divya", "Karthik", "Sneha", "Vikram", "Anitha", "Suresh", "Lakshmi", "Nikhil"];
  const last = ["Sharma", "Rao", "Iyer", "Nair", "Reddy", "Menon", "Pillai", "Kumar", "Das", "Patel"];
  const tags = ["vip", "regular", "new"];
  const customers = Array.from({ length: 1000 }, (_, i) => ({
    name: `${first[i % first.length]} ${last[(i * 7) % last.length]}`,
    phone: `91${9000000000 + i * 7919}`,
    clientId,
    tags: [tags[i % 3]],
    optedOut: i % 97 === 0,
  }));
  await db.customer.createMany({ data: customers, skipDuplicates: true });

  const offer = await templateOnce("weekly_offer", {
    clientId,
    name: "weekly_offer",
    language: "en",
    category: "MARKETING",
    status: "APPROVED",
    headerType: "TEXT",
    headerText: "This week's special ☕",
    body: "Hi {{1}}, enjoy *{{2}}* on your next visit. Show this message at the counter before Sunday.",
    footer: "Reply STOP to unsubscribe",
    buttons: [{ type: "QUICK_REPLY", text: "Interested" }],
    variables: { "1": { source: "first_name" }, "2": { source: "static", value: "20% off any drink" } },
  });
  await templateOnce("order_ready", {
    clientId,
    name: "order_ready",
    language: "en",
    category: "UTILITY",
    status: "APPROVED",
    body: "Hi {{1}}, your order is ready for pickup. See you soon!",
    variables: { "1": { source: "first_name" } },
  });
  await templateOnce("login_code", { clientId, name: "login_code", language: "en", category: "AUTHENTICATION", status: "APPROVED", body: "", codeExpiryMins: 10, securityNote: true, buttons: [{ type: "COPY_CODE", text: "Copy code" }] });

  const schedule = { scheduleType: "WEEKLY" as const, daysOfWeek: [2, 5], sendTime: "10:00", runAt: null, timezone: "Asia/Kolkata" };
  const campaign =
    (await db.campaign.findFirst({ where: { clientId, name: "Tuesday & Friday offers" } })) ??
    (await db.campaign.create({
      data: { clientId, name: "Tuesday & Friday offers", templateId: offer.id, ...schedule, batchSize: 100, intervalMinutes: 10, nextRunAt: computeNextRun(schedule) },
    }));

  // Two weeks of history
  if (!(await db.campaignRun.count({ where: { campaignId: campaign.id } }))) {
    const all = await db.customer.findMany({ where: { clientId, optedOut: false }, select: { id: true, name: true } });
    for (let d = 13; d >= 1; d--) {
      const day = new Date(Date.now() - d * 86_400_000);
      if (![2, 5].includes(day.getDay())) continue;
      day.setUTCHours(4, 30, 0, 0);
      const run = await db.campaignRun.create({
        data: { campaignId: campaign.id, scheduledFor: day, startedAt: day, status: "COMPLETED", total: all.length, completedAt: new Date(day.getTime() + 90 * 60_000) },
      });
      await db.message.createMany({
        data: all.map((c, i) => {
          const r = (i * 37 + d * 11) % 100;
          const status: MessageStatus = r < 3 ? "FAILED" : r < 10 ? "SENT" : r < 45 ? "DELIVERED" : "READ";
          const sentAt = new Date(day.getTime() + Math.floor(i / 100) * 10 * 60_000);
          return {
            runId: run.id,
            customerId: c.id,
            templateId: offer.id,
            templateName: offer.name,
            status,
            simulated: true,
            createdAt: day,
            sentAt: status === "FAILED" ? null : sentAt,
            deliveredAt: ["DELIVERED", "READ"].includes(status) ? new Date(sentAt.getTime() + 20_000) : null,
            readAt: status === "READ" ? new Date(sentAt.getTime() + 45 * 60_000) : null,
            failedAt: status === "FAILED" ? sentAt : null,
            error: status === "FAILED" ? "Message undeliverable (131026)" : null,
            body: `This week's special ☕\n\nHi ${c.name.split(" ")[0]}, enjoy *20% off any drink* on your next visit. Show this message at the counter before Sunday.\n\nReply STOP to unsubscribe`,
          };
        }),
      });
    }
  }
  console.log("✓ Demo data added: 1,000 customers, 3 templates, 1 campaign, message history");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
