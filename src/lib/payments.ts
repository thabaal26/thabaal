import "server-only";
import { db } from "./db";
import type { TemplateButton } from "./template";

// Which template carries WhatsApp's "Review and pay" button for payment requests.

/** Our own "order details" template, preferred once approved for requests after the customer's 24-hour window. */
export const PAYMENT_TEMPLATE = "payment_request";

const hasPayButton = (t: { buttons: unknown }) => (t.buttons as TemplateButton[]).some((b) => b.type === "ORDER_DETAILS");

/**
 * The approved template with a "Review and pay" button to send: payment_request when Meta has approved it,
 * otherwise one added from Meta's template library (pre-approved), so payments work while ours is in review.
 */
export async function paymentTemplateFor(clientId: string) {
  const approved = (await db.template.findMany({ where: { clientId, status: "APPROVED" }, orderBy: { name: "asc" } })).filter(hasPayButton);
  return approved.find((t) => t.name === PAYMENT_TEMPLATE) ?? approved[0] ?? null;
}
