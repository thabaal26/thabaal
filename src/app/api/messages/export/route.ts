import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { messageWhere } from "@/lib/queries";
import { getScope, ownedMessages, readSessionUserId, SESSION_COOKIE } from "@/lib/session";

export async function GET(req: NextRequest) {
  const userId = await readSessionUserId((await cookies()).get(SESSION_COOKIE)?.value);
  if (!userId) return new NextResponse("Unauthorized", { status: 401 });
  const scope = await getScope();

  const rows = await db.message.findMany({
    where: { ...messageWhere(Object.fromEntries(req.nextUrl.searchParams)), ...ownedMessages(scope) },
    include: { customer: true, run: { include: { campaign: true } } },
    orderBy: { createdAt: "desc" },
    take: 50_000,
  });
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [
    ["Customer", "Phone", "Campaign", "Template", "Status", "Sent", "Delivered", "Read", "Error", "Message"].join(","),
    ...rows.map((m) =>
      [m.customer.name, `+${m.customer.phone}`, m.run?.campaign.name ?? "Test", m.templateName, m.status,
        fmtDate(m.sentAt), fmtDate(m.deliveredAt), fmtDate(m.readAt), m.error, m.body].map(esc).join(","),
    ),
  ];
  return new NextResponse("﻿" + lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="message-log-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
