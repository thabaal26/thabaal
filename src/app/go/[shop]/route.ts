import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chatLink, orderText } from "@/lib/orders-elsewhere-core";
import { readPaySettings } from "@/lib/pay-settings";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

/**
 * "Chat to Order" in a shop's templates (Payments › Payment settings › How orders work): opens WhatsApp with the
 * shop's main order number, "I'd like to order" typed in. The template keeps one link, so the number can change
 * without sending the template to Meta again. Falls back to the shop's support phone; nothing to open is a 404.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ shop: string }> }) {
  const { shop } = await params;
  const c = /^[a-z0-9]{10,40}$/i.test(shop)
    ? await db.client.findUnique({ where: { id: shop }, select: { name: true, paySettings: true, paymentConfig: true, supportPhone: true } })
    : null;
  const phone = c ? readPaySettings(c.paySettings, c.paymentConfig).orderPhone || normalizePhone(c.supportPhone ?? "") : null;
  if (!c || !phone) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(chatLink(phone, orderText(c.name)), { status: 302, headers: { "Cache-Control": "no-store" } });
}
