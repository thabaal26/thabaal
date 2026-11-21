import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3200";
const db = new PrismaClient();
const results = [];

const check = (name, pass, extra = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

async function get(path, token) {
  const r = await fetch(BASE + path, {
    headers: token ? { cookie: `wp_session=${token}` } : {},
    redirect: "manual",
  });
  const text = await r.text();
  return { status: r.status, location: r.headers.get("location") ?? "", contentType: r.headers.get("content-type") ?? "", body: text };
}

try {
  // 1. Create test admin and test client
  const adminUser = await db.user.create({
    data: {
      email: `admin-audit-${Date.now()}@thabaal.test`,
      name: "Admin Audit Operator",
      passwordHash: "x",
      role: "ADMIN",
    },
  });

  const clientUser = await db.client.create({
    data: {
      name: `Admin Audit Store ${Date.now()}`,
      homeCity: "Madurai",
      orderPrefix: "AA",
      workspaceMode: "LIVE_ACTIVE",
    },
  });

  const lead = await db.lead.create({
    data: {
      shop: "Audit Demo Store",
      person: "Audit Owner",
      phone: "9876500000",
      source: "Home page form",
      stage: "new",
      nextOn: new Date(),
      createdBy: "Website",
    },
  });

  const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
  const adminToken = await new SignJWT({ sub: adminUser.id, sv: 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);

  const nonAdminUser = await db.user.create({
    data: {
      email: `client-audit-${Date.now()}@thabaal.test`,
      name: "Client Non-Admin",
      passwordHash: "x",
      role: "CLIENT",
      access: "STAFF",
      clientId: clientUser.id,
    },
  });

  const clientToken = await new SignJWT({ sub: nonAdminUser.id, sv: 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);

  // 2. Define the 12 Admin Routes
  const ADMIN_ROUTES = [
    { path: "/admin", name: "1. Overview Dashboard", domCheck: "Overview" },
    { path: "/admin/clients", name: "2. All Clients Directory", domCheck: "clients" },
    { path: `/admin/clients/${clientUser.id}`, name: "3. Client Detail", domCheck: clientUser.name },
    { path: "/admin/enquiries", name: "4. Enquiries Pipeline", domCheck: "Enquiries" },
    { path: `/admin/enquiries/${lead.id}`, name: "5. Enquiry Detail", domCheck: "Audit Demo Store" },
    { path: "/admin/inbound", name: "6. Inbound Webhook Monitor", domCheck: "Inbound messages" },
    { path: "/admin/messages", name: "7. Messages & Broadcaster", domCheck: "Messages" },
    { path: "/admin/payments", name: "8. Payments Ledger", domCheck: "Payments" },
    { path: "/admin/payments/export", name: "9. Payments CSV Export", isExport: true },
    { path: "/admin/settings", name: "10. Settings Admin", domCheck: "Settings" },
    { path: "/admin/settings/sending", name: "11. Sending Defaults", domCheck: "Sending and look" },
    { path: "/admin/usage", name: "12. Usage & Analytics", domCheck: "Usage and analytics" },
  ];

  console.log("\n--- EXECUTING TWELVE-ROUTE ADMIN BROWSER / HTTP VERIFICATION ---\n");

  for (const route of ADMIN_ROUTES) {
    const res = await get(route.path, adminToken);
    if (route.isExport) {
      const ok = res.status === 200 && res.contentType.includes("text/csv");
      check(`Admin Route: ${route.name} (${route.path})`, ok, `Status: ${res.status}, Content-Type: ${res.contentType}`);
    } else {
      const containsMarker = res.body.toLowerCase().includes(route.domCheck.toLowerCase());
      const ok = res.status === 200 && containsMarker;
      check(`Admin Route: ${route.name} (${route.path})`, ok, `Status: ${res.status}, DOM Marker: "${route.domCheck}"`);
    }

    // Security Gate: Non-admin user MUST be rejected from every admin route
    const nonAdminRes = await get(route.path, clientToken);
    const rejected = nonAdminRes.status === 307 || nonAdminRes.status === 403 || nonAdminRes.status === 401;
    check(`Security Gate: Non-Admin Rejected on ${route.path}`, rejected, `Status: ${nonAdminRes.status} -> ${nonAdminRes.location}`);
  }

  // Clean up
  await db.lead.delete({ where: { id: lead.id } });
  await db.user.delete({ where: { id: adminUser.id } });
  await db.user.delete({ where: { id: nonAdminUser.id } });
  await db.client.delete({ where: { id: clientUser.id } });
} finally {
  await db.$disconnect();
}

const failed = results.filter((r) => !r.pass);
console.log(`\nAdmin Routes Audit: ${results.length - failed.length}/${results.length} checks passed.\n`);
process.exit(failed.length ? 1 : 0);
