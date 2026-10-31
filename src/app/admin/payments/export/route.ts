import { formatInTimeZone } from "date-fns-tz";
import { NextResponse } from "next/server";
import { cycleName, loadPayments, planName } from "@/lib/admin-data";
import { APP_TZ } from "@/lib/format";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const cell = (v: string | number | null | undefined) => {
  const s = v == null ? "" : String(v);
  // Quote every cell; neutralise spreadsheet formulas in text a business typed (UPI reference, notes).
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};
const when = (d: Date | null) => (d ? formatInTimeZone(d, APP_TZ, "yyyy-MM-dd HH:mm") : "");

/** Admin panel › Payments: every plan payment on record as a CSV statement. Admin logins only. */
export async function GET() {
  const user = await requireUser();
  if (user.role !== "ADMIN") return new NextResponse("Not allowed", { status: 403 });
  const rows = await loadPayments();
  const head = ["Sent", "Business", "Plan", "Cycle", "Amount (INR)", "Status", "Method", "Payment reference", "Paid with", "Paid on (as told)", "Period starts", "Period ends", "Bill no", "Checked by", "Checked at", "Note"];
  const lines = rows.map((p) =>
    [
      when(p.createdAt),
      p.client.name,
      planName(p.plan),
      cycleName(p.cycle),
      (p.amountPaise / 100).toFixed(2),
      p.status,
      p.method,
      p.utr,
      p.payApp,
      p.paidOn,
      when(p.startsAt),
      when(p.endsAt),
      p.billNo,
      p.decidedBy,
      when(p.decidedAt),
      p.note,
    ]
      .map(cell)
      .join(","),
  );
  const csv = "﻿" + [head.map(cell).join(","), ...lines].join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="thabaal-plan-payments-${formatInTimeZone(new Date(), APP_TZ, "yyyy-MM-dd")}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
