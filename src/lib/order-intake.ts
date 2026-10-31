// What happens to a new WhatsApp order (a catalogue cart, or a one-tap reorder), the same way for every shop:
//   1. Earlier carts that were never confirmed are replaced by it (the customer is told in the next message).
//   2. An earlier order that is confirmed or paid but not packed yet is never touched: the customer is asked
//      "Add to order X / Separate order". Add puts the items into a cash-on-delivery order (one delivery, one
//      cash collection), or ships a paid order's extra items together with it (paid separately).
//   3. Automatic loyalty points, then the delivery address, then how to pay.
import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { startAddressStep } from "./delivery-address";
import { pushOrderToSheet } from "./google-sheets-live";
import { autoRedeemPoints } from "./loyalty-redeem";
import { getOrderPricing } from "./order-pricing";
import { itemsWithNames, money, nextOrderRef, orderRef, type OrderItem } from "./orders";
import { cancelSupersededOrdersForCustomer, logMessage, replyContext, startCheckout, textInWindow } from "./payments";
import { getSettings } from "./provider";
import { SALE_WHERE } from "./sale";
import { sendInteractiveButtons } from "./whatsapp";
import { bold, buttonTitle, hello, itemLines } from "./wa-text";

const DAY = 86_400_000;
/** An earlier order counts as "in progress" for this long. */
const OPEN_DAYS = 7;

export const ADD_TO_ORDER = "Add to order?";

async function canMessage(c: { id: string; clientId: string; optedOut: boolean }) {
  if (c.optedOut || (await getSettings()).provider !== "META") return false;
  return (await replyContext(c)).open;
}

const withCustomer = { customer: true, client: { select: { name: true } } } as const;
const load = (id: string) => db.order.findUnique({ where: { id }, include: withCustomer });

/** Address, then payment: the rest of the journey for an order the customer has decided on. */
async function toAddressAndPayment(orderId: string) {
  const step = await startAddressStep(orderId).catch((e) => (console.error("Address step failed", e), "skip" as const));
  if (step === "skip") {
    const o = await db.order.findUnique({ where: { id: orderId }, select: { id: true, clientId: true, total: true } });
    if (o) await startCheckout(o).catch((e) => console.error("Automatic checkout start failed", e));
  }
}

/** A new order from WhatsApp: replace never-confirmed carts, use points, ask about an order in progress, then address and payment. */
export async function afterNewOrder(order: { id: string; number: number; ref: string | null; total: number; currency: string; customerId: string }) {
  await cancelSupersededOrdersForCustomer(order.customerId, order).catch((e) => console.error("Could not expire old carts", e));
  await autoRedeemPoints(order.id).catch((e) => console.error("Could not use loyalty points", e));
  const asked = await offerAddToEarlier(order.id).catch((e) => (console.error("Add-to-order question failed", e), false));
  if (!asked) await toAddressAndPayment(order.id);
}

/** The customer's newest confirmed or paid order that isn't packed or sent yet (one they could still add to). */
async function orderInProgress(customerId: string, exceptId: string) {
  return db.order.findFirst({
    where: {
      customerId,
      id: { not: exceptId },
      status: { in: ["NEW", "CONFIRMED", "PAID"] },
      packedAt: null,
      dispatchedAt: null,
      createdAt: { gte: new Date(Date.now() - OPEN_DAYS * DAY) },
      AND: [SALE_WHERE],
    },
    orderBy: { createdAt: "desc" },
  });
}

/** Asks "Add to order X / Separate order" when the customer already has an order being prepared. */
async function offerAddToEarlier(newId: string) {
  const o = await load(newId);
  if (!o || o.status !== "NEW" || o.paidAt) return false;
  const earlier = await orderInProgress(o.customerId, o.id);
  if (!earlier || !(await canMessage(o.customer))) return false;
  const items = (await itemsWithNames(o)) as OrderItem[];
  const oldRef = orderRef(earlier);
  const how = earlier.paidAt ? "paid" : earlier.paymentMethod === "cod" ? "cash on delivery" : "confirmed";
  const body = [
    `${hello(o.customer.name)} you already have order ${bold(oldRef)} (${how}, ${bold(money(earlier.total, earlier.currency))}) being prepared.`,
    `Shall we add these new items to it, or keep them as a separate order?`,
    itemLines(items, o.currency),
  ].join("\n\n");
  const { number, cfg } = await replyContext(o.customer);
  const res = await sendInteractiveButtons(
    cfg,
    o.customer.phone,
    body,
    [
      { id: `cart_add:${o.id}:${earlier.id}`, title: buttonTitle(`➕ Add to ${oldRef}`) },
      { id: `cart_sep:${o.id}`, title: "🆕 Separate order" },
    ],
    { header: "You have an order in progress", footer: o.client.name },
  );
  await logMessage(o.customer.id, ADD_TO_ORDER, body, res, number?.id ?? null);
  await db.order.update({ where: { id: o.id }, data: { mergeWith: earlier.id } });
  return true;
}

const note = (prev: string | null, line: string) => [prev, line].filter(Boolean).join("\n").slice(0, 1000);

/** Items of two orders as one list: the same product's quantities add up. */
function mergeItems(a: OrderItem[], b: OrderItem[]) {
  const out = a.map((i) => ({ ...i }));
  for (const i of b) {
    const same = out.find((x) => x.id === i.id && Number(x.price) === Number(i.price));
    if (same) same.quantity = (Number(same.quantity) || 0) + (Number(i.quantity) || 0);
    else out.push({ ...i });
  }
  return out;
}

/** The customer answered "Add to order X" (cart_add:new:old) or "Separate order" (cart_sep:new). */
export async function handleCartChoice(customerId: string, actionVal: string) {
  const add = actionVal.startsWith("cart_add:");
  const [newId, oldId] = actionVal.slice(add ? 9 : 9).split(":");
  const o = await load(newId);
  if (!o || o.customerId !== customerId || o.status !== "NEW" || o.paidAt) return;
  // Claim the answer once: a second tap, or the other button, changes nothing.
  const claimed = await db.order.updateMany({ where: { id: o.id, mergeWith: { not: null } }, data: { mergeWith: null } });
  if (!claimed.count) return;
  const newRef = orderRef(o);

  if (add && oldId) {
    const old = await load(oldId);
    const stillOpen = old && old.customerId === customerId && old.status !== "CANCELLED" && !old.packedAt && !old.dispatchedAt;
    if (!old || !stillOpen) {
      await db.order.update({ where: { id: o.id }, data: { internalNote: note(o.internalNote, "Customer asked to add to an earlier order that was already packed") } });
      await textInWindow(o.customer, `Your earlier order is already packed, so these items will come as a separate order ${bold(newRef)}.`, "Add to order").catch(() => {});
      return toAddressAndPayment(o.id);
    }
    const oldRef = orderRef(old);
    const codUnpaid = old.paymentMethod === "cod" && !old.paidAt && !((old.paidAmount ?? 0) > 0);
    if (codUnpaid) {
      // One delivery, one cash collection: the new items join the cash-on-delivery order.
      const oldItems = (await itemsWithNames(old)) as OrderItem[];
      const newItems = (await itemsWithNames(o)) as OrderItem[];
      const added = getOrderPricing(newItems).subtotal;
      const merged = mergeItems(oldItems, newItems);
      const total = Math.round((old.total + added) * 100) / 100;
      await db.order.update({
        where: { id: old.id },
        data: { items: merged as unknown as Prisma.InputJsonValue, total, internalNote: note(old.internalNote, `Customer added ${newRef} (+${money(added, old.currency)}) on WhatsApp`) },
      });
      await db.order.update({ where: { id: o.id }, data: { status: "CANCELLED", internalNote: note(o.internalNote, `Added to ${oldRef} at the customer's request`), paymentReminderAt: new Date() } });
      pushOrderToSheet(old.id, "ORDER_UPDATE", `Items from ${newRef} added`);
      pushOrderToSheet(o.id, "ORDER_UPDATE", `Added to ${oldRef}`);
      const text = [
        `✅ ${bold("Added to your order")}`,
        `Your new items are now part of order ${bold(oldRef)}.`,
        itemLines(merged, old.currency, 12),
        `${bold(`New total: ${money(total, old.currency)}`)} (cash on delivery)`,
        `Everything will come together in one delivery.`,
      ].join("\n\n");
      await textInWindow(o.customer, text, "Add to order").catch(() => {});
      return;
    }
    // A paid order can't take more money on its card: the new items are paid for on their own and shipped with it.
    await db.order.update({
      where: { id: o.id },
      data: {
        note: old.note ?? o.note,
        addressConfirmedAt: old.note ? new Date() : null,
        internalNote: note(o.internalNote, `Ship together with ${oldRef}`),
      },
    });
    await db.order.update({ where: { id: old.id }, data: { internalNote: note(old.internalNote, `Ship together with ${newRef}`) } });
    pushOrderToSheet(o.id, "ORDER_UPDATE", `Ship together with ${oldRef}`);
    await textInWindow(o.customer, `Sure! Your new items (order ${bold(newRef)}) will be delivered together with order ${bold(oldRef)}. Please complete the payment for them below.`, "Add to order").catch(() => {});
    if (old.note) {
      const mode = await startCheckout(o).catch(() => "none" as const);
      if (mode === "none") await textInWindow(o.customer, `Our team will confirm order ${bold(newRef)} shortly.`, "Add to order").catch(() => {});
      return;
    }
    return toAddressAndPayment(o.id);
  }

  await db.order.update({ where: { id: o.id }, data: { internalNote: note(o.internalNote, "Customer kept it as a separate order") } });
  return toAddressAndPayment(o.id);
}

/* ---------- One-tap reorder ---------- */

export const REORDER_RE = /^\s*(re-?order|re-?order now|order again|buy again|same order|same order again|repeat( my)? order|same as last time|order same)\s*[.!]*\s*$/i;
export const REORDER_OFFER = "Reorder";

/** The customer's last order that went through (paid, COD confirmed or delivered). */
async function lastBought(customerId: string) {
  return db.order.findFirst({ where: { customerId, status: { not: "CANCELLED" }, AND: [SALE_WHERE] }, orderBy: { createdAt: "desc" } });
}

/** "Same as last time?" with the last order's items. False when there is no earlier order (the caller shows the catalogue). */
export async function offerReorder(customerId: string) {
  const c = await db.customer.findUnique({ where: { id: customerId }, include: { client: { select: { name: true } } } });
  if (!c || !(await canMessage(c))) return false;
  const last = await lastBought(customerId);
  if (!last) return false;
  const items = (await itemsWithNames(last)) as OrderItem[];
  if (!items.length) return false;
  const pricing = getOrderPricing(items);
  const when = last.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  const body = [
    `${hello(c.name)} here is your last order ${bold(orderRef(last))} from ${when}:`,
    itemLines(items, last.currency, 12),
    `${pricing.shipping > 0 ? `Shipping: ${money(pricing.shipping, last.currency)}\n` : ""}${bold(`Total: ${money(pricing.total, last.currency)}`)}`,
    `Shall we place the same order again?`,
  ].join("\n\n");
  const { number, cfg } = await replyContext(c);
  const res = await sendInteractiveButtons(
    cfg,
    c.phone,
    body,
    [
      { id: `reorder_yes:${last.id}`, title: "✅ Yes, same order" },
      { id: `reorder_change:${last.id}`, title: "🛍️ Change items" },
    ],
    { header: "Order again", footer: `${c.client.name} · prices as on your last order`.slice(0, 60) },
  );
  await logMessage(c.id, REORDER_OFFER, body, res, number?.id ?? null);
  return true;
}

/** "Yes, same order": a new order with the same items, then the usual address and payment steps. */
export async function placeReorder(customerId: string, lastId: string, waMessageId?: string) {
  const last = await db.order.findUnique({ where: { id: lastId }, include: { customer: true } });
  if (!last || last.customerId !== customerId) return null;
  // The same tap delivered twice makes one order.
  const key = waMessageId ? `reorder.${waMessageId}` : undefined;
  if (key && (await db.order.findUnique({ where: { waMessageId: key }, select: { id: true } }))) return null;
  const items = (await itemsWithNames(last)) as OrderItem[];
  const pricing = getOrderPricing(items);
  let created;
  try {
    created = await db.order.create({
      data: {
        ref: await nextOrderRef(last.clientId),
        clientId: last.clientId,
        customerId,
        waMessageId: key,
        catalogId: last.catalogId,
        note: last.customer.locationRaw?.trim() || last.customer.location?.trim() || last.note || null,
        internalNote: `One-tap reorder of ${orderRef(last)}`,
        items: items as unknown as Prisma.InputJsonValue,
        total: pricing.total,
        currency: last.currency,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null;
    throw e;
  }
  pushOrderToSheet(created.id, "NEW_ORDER");
  await afterNewOrder(created);
  return created;
}
