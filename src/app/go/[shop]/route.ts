import { NextResponse, type NextRequest } from "next/server";
import { absoluteUrl } from "@/lib/media";
import { db } from "@/lib/db";
import { chatLink, orderText } from "@/lib/orders-elsewhere-core";
import { readPaySettings } from "@/lib/pay-settings";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

/** Link-preview fetchers (WhatsApp, Facebook, Telegram, …): they get the shop's own preview, not thabaal's. */
const PREVIEW_BOT = /WhatsApp|facebookexternalhit|Facebot|meta-externalagent|TelegramBot|Twitterbot|Slackbot|LinkedInBot|Discordbot|SkypeUriPreview/i;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * "Chat to Order" in a shop's templates (Payments › Payment settings › How orders work): opens WhatsApp with the
 * shop's main order number, "I'd like to order" typed in. The template keeps one link, so the number can change
 * without sending the template to Meta again. Falls back to the shop's support phone; nothing to open is a 404.
 * WhatsApp shows a preview of this link under the template's picture and doesn't follow the redirect: link-preview
 * fetchers get a page with the shop's name, tagline and logo (and its website), so thabaal's own page never shows.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ shop: string }> }) {
  const { shop } = await params;
  const c = /^[a-z0-9]{10,40}$/i.test(shop)
    ? await db.client.findUnique({
        where: { id: shop },
        select: { name: true, tagline: true, website: true, logoUrl: true, bannerUrl: true, defaultImageUrl: true, paySettings: true, paymentConfig: true, supportPhone: true },
      })
    : null;
  const phone = c ? readPaySettings(c.paySettings, c.paymentConfig).orderPhone || normalizePhone(c.supportPhone ?? "") : null;
  if (!c || !phone) return new NextResponse("Not found", { status: 404 });
  const to = chatLink(phone, orderText(c.name));
  if (!PREVIEW_BOT.test(req.headers.get("user-agent") ?? "")) return NextResponse.redirect(to, { status: 302, headers: { "Cache-Control": "no-store" } });

  const title = `${c.name} · Chat to Order`;
  const description = c.tagline?.trim() || `Order from ${c.name} on WhatsApp.`;
  const image = absoluteUrl(c.logoUrl) ?? absoluteUrl(c.bannerUrl) ?? absoluteUrl(c.defaultImageUrl);
  const site = c.website?.trim() ? (/^https?:\/\//i.test(c.website.trim()) ? c.website.trim() : `https://${c.website.trim()}`) : to;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="${esc(c.name)}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(site)}">${image ? `<meta property="og:image" content="${esc(image)}">` : ""}
<meta http-equiv="refresh" content="0; url=${esc(to)}"></head>
<body><a href="${esc(to)}">${esc(title)}</a></body></html>`;
  return new NextResponse(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
