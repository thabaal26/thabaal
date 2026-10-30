import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { webhookSignatureOk } from "@/lib/razorpay";
import { handleRazorpayEvent } from "@/lib/razorpay-billing";

// Razorpay → Thabaal. Set in Razorpay Dashboard → Webhooks: URL https://www.thabaal.in/api/razorpay/webhook,
// the secret = RAZORPAY_WEBHOOK_SECRET, events: payment.captured, payment.failed, order.paid, refund.processed and
// subscription.* (authenticated, activated, charged, pending, halted, cancelled, completed).
// Only signed requests are read. Each event id is handled once; a failure answers 500 so Razorpay retries.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!webhookSignatureOk(raw, req.headers.get("x-razorpay-signature"))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  let body: Parameters<typeof handleRazorpayEvent>[0];
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const eventId = req.headers.get("x-razorpay-event-id")?.slice(0, 100) || null;
  if (eventId) {
    try {
      await db.razorpayEvent.create({ data: { id: eventId, event: String(body.event).slice(0, 60) } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return NextResponse.json({ ok: true, duplicate: true });
      throw e;
    }
  }
  try {
    const result = await handleRazorpayEvent(body);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error("razorpay webhook", body.event, e);
    if (eventId) await db.razorpayEvent.delete({ where: { id: eventId } }).catch(() => {});
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
