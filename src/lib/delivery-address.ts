// The delivery address step of a WhatsApp cart, before payment.
//   New customer         → WhatsApp's address form (India); a number it doesn't work for gets a "type your
//                          address or tap Send location" message instead (also used when Meta says the form
//                          can't be shown on their phone, error 1026).
//   Address on file      → "Deliver to this address?" with Yes / New address buttons ("yes"/"same" typed works too).
//   Any of: form answer, a typed address, a shared location → saved on the customer and the order, then the
//   payment choice (or pay-now) goes out, showing "Deliver to: …".
// Payment settings › "Ask for the delivery address" turns the step off (the cart goes straight to payment).
import "server-only";
import type { Prisma } from "@prisma/client";
import { parseAddressText } from "./address";
import {
  formAddressText,
  formErrors,
  formPrefill,
  formValuesFrom,
  isIndianNumber,
  locationAddress,
  SAME_ADDRESS_RE,
  type DeliveryAddress,
  type FormValues,
} from "./address-form";
import { db } from "./db";
import { pushOrderToSheet } from "./google-sheets-live";
import { orderRef } from "./orders";
import { paySettingsFor } from "./pay-settings-server";
import { firstName, logMessage, replyContext, startCheckout, textInWindow } from "./payments";
import { getSettings } from "./provider";
import { sendAddressMessage, sendInteractiveButtons, sendLocationRequest } from "./whatsapp";

/** Message labels (Message.templateName) for the address step; the webhook reads ADDRESS_FORM on a failed status. */
export const ADDRESS_FORM = "Address form";
export const ADDRESS_CHECK = "Address check";
export const ADDRESS_REQUEST = "Address request";

/** An unanswered address question stops counting after this long (a later "yes" isn't taken as an answer). */
const WAIT_MS = 7 * 86_400_000;

const orderWithCustomer = { customer: true, client: { select: { name: true } } } as const;

async function loadOrder(orderId: string) {
  return db.order.findUnique({ where: { id: orderId }, include: orderWithCustomer });
}
type LoadedOrder = NonNullable<Awaited<ReturnType<typeof loadOrder>>>;

/** Packed, paid, sent or cancelled: nothing about the order changes any more. */
const settled = (o: { status: string; paidAt: Date | null; packedAt: Date | null; dispatchedAt: Date | null }) =>
  Boolean(o.paidAt || o.packedAt || o.dispatchedAt || ["CANCELLED", "DISPATCHED", "DELIVERED"].includes(o.status));

/** The customer's newest order still waiting for its address. */
export async function awaitingAddressOrder(customerId: string) {
  return db.order.findFirst({
    where: { customerId, status: "NEW", paidAt: null, addressConfirmedAt: null, addressAskedAt: { not: null, gte: new Date(Date.now() - WAIT_MS) } },
    orderBy: { createdAt: "desc" },
    include: orderWithCustomer,
  });
}

/** The customer's newest order that can still take a new address (not packed or sent yet). */
async function changeableOrder(customerId: string) {
  return db.order.findFirst({
    where: { customerId, status: { in: ["NEW", "CONFIRMED", "PAID"] }, packedAt: null, dispatchedAt: null, createdAt: { gte: new Date(Date.now() - WAIT_MS) } },
    orderBy: { createdAt: "desc" },
    include: orderWithCustomer,
  });
}

async function sendForm(order: LoadedOrder, opts: { errors?: Record<string, string>; values?: FormValues } = {}) {
  const c = order.customer;
  const { number, cfg } = await replyContext(c);
  const ref = orderRef(order);
  const body = opts.errors
    ? `Please check the marked fields and send your address again for order ${ref}.`
    : `Hello ${firstName(c.name)}, where should we deliver your ${order.client.name} order ${ref}?\n\nTap the button below to add your address. We'll keep it for your next order too.`;
  const res = await sendAddressMessage(cfg, c.phone, body, { values: opts.values ?? formPrefill(c), errors: opts.errors });
  await logMessage(c.id, ADDRESS_FORM, body, res, number?.id ?? null);
}

async function sendTypeOrPin(order: LoadedOrder) {
  const c = order.customer;
  const { number, cfg } = await replyContext(c);
  const body = `Hello ${firstName(c.name)}, where should we deliver your ${order.client.name} order ${orderRef(order)}?\n\nPlease type your full address here (house/flat no., street, area, city and pincode), or tap "Send location" to share your location.`;
  const res = await sendLocationRequest(cfg, c.phone, body);
  await logMessage(c.id, ADDRESS_REQUEST, body, res, number?.id ?? null);
}

/** Whether WhatsApp messages can go to this customer now (Cloud API, not opted out, inside the 24-hour window). */
async function canMessage(c: { id: string; clientId: string; optedOut: boolean }) {
  if (c.optedOut) return false;
  if ((await getSettings()).provider !== "META") return false;
  return (await replyContext(c)).open;
}

/**
 * A new cart arrived: ask for the address (or confirm the saved one). "skip" means the step doesn't apply (turned
 * off, nothing can be sent, the order can't change) and the caller goes straight to payment.
 */
export async function startAddressStep(orderId: string): Promise<"asked" | "skip"> {
  const order = await loadOrder(orderId);
  if (!order || settled(order) || order.total <= 0) return "skip";
  const pay = await paySettingsFor(order.clientId);
  if (!pay.settings.askAddress) return "skip";
  const c = order.customer;
  if (!(await canMessage(c))) return "skip";
  const saved = c.locationRaw?.trim() || c.location?.trim() || "";
  try {
    if (saved) {
      const { number, cfg } = await replyContext(c);
      const body = `Hello ${firstName(c.name)}, shall we deliver your ${order.client.name} order ${orderRef(order)} to this address?\n\n📍 ${saved.slice(0, 400)}`;
      const res = await sendInteractiveButtons(
        cfg,
        c.phone,
        body,
        [
          { id: `addr_ok:${order.id}`, title: "✅ Yes, deliver here" },
          { id: `addr_new:${order.id}`, title: "✏️ New address" },
        ],
        { header: "Delivery address" },
      );
      await logMessage(c.id, ADDRESS_CHECK, body, res, number?.id ?? null);
    } else if (isIndianNumber(c.phone)) {
      await sendForm(order);
    } else {
      await sendTypeOrPin(order);
    }
  } catch (e) {
    // The form (or the buttons) couldn't go: the plain "type it or share your location" message still can.
    try {
      await sendTypeOrPin(order);
    } catch {
      console.warn(`Address step for order ${order.id} not sent:`, e);
      return "skip";
    }
  }
  await db.order.update({ where: { id: order.id }, data: { addressAskedAt: new Date() } });
  return "asked";
}

/** Meta couldn't show the address form on this phone (old WhatsApp, error 1026): ask in plain words instead. */
export async function sendAddressFallback(customerId: string) {
  const order = await awaitingAddressOrder(customerId);
  if (!order || !(await canMessage(order.customer))) return false;
  await sendTypeOrPin(order);
  return true;
}

/** The customer tapped "New address" (or wants to change it): the form, filled with what we know. */
export async function askNewAddress(orderId: string, customerId: string) {
  const order = await loadOrder(orderId);
  if (!order || order.customerId !== customerId) return;
  if (order.status === "CANCELLED") return replacedNotice(order);
  if (settled(order)) {
    await textInWindow(order.customer, `Order ${orderRef(order)} is already packed or on its way, so its address can't change now. Reply here and our team will help.`, "Address (no change)").catch(() => {});
    return;
  }
  try {
    if (isIndianNumber(order.customer.phone)) await sendForm(order);
    else await sendTypeOrPin(order);
  } catch {
    await sendTypeOrPin(order).catch(() => {});
  }
}

async function replacedNotice(order: LoadedOrder) {
  await textInWindow(order.customer, `This cart (${orderRef(order)}) was replaced by your newer order, so nothing was changed. Please use the latest message.`, "Address (old cart)").catch(() => {});
}

/** The customer tapped "Yes, deliver here" (or typed "yes"/"same"). */
export async function confirmSavedAddress(orderId: string, customerId: string) {
  const order = await loadOrder(orderId);
  if (!order || order.customerId !== customerId) return;
  if (order.status === "CANCELLED") return replacedNotice(order);
  if (order.addressConfirmedAt || settled(order)) return; // a second tap changes nothing
  const saved = order.customer.locationRaw?.trim() || order.customer.location?.trim() || "";
  if (!saved) return askNewAddress(orderId, customerId);
  const done = await db.order.updateMany({
    where: { id: order.id, addressConfirmedAt: null },
    data: { addressConfirmedAt: new Date(), note: order.note?.trim() || saved.slice(0, 500), mapUrl: order.mapUrl ?? (order.customer.deliveryAddress as DeliveryAddress | null)?.mapUrl ?? null },
  });
  if (done.count) await continueToPayment(order.id, "Customer confirmed the saved address");
}

/** After the address: the payment choice (or pay-now). If payment was already settled some other way, just thank them. */
async function continueToPayment(orderId: string, sheetNote: string) {
  const o = await loadOrder(orderId);
  if (!o) return;
  pushOrderToSheet(o.id, "ORDER_UPDATE", sheetNote);
  // Already chose cash on delivery (typed "COD") or staff already sent the payment request: no second ask.
  const decided = o.paymentMethod === "cod" || Boolean(o.paymentRequestedAt);
  const mode = decided ? "none" : await startCheckout(o);
  if (mode === "none")
    await textInWindow(o.customer, `Thank you! We'll deliver order ${orderRef(o)} to:\n📍 ${o.note ?? ""}`, "Address saved").catch(() => {});
}

/**
 * Staff added the address themselves (e.g. after a call) while the order waited for it on WhatsApp: the step is
 * done and the payment message goes, as if the customer had answered. False when the order wasn't waiting.
 */
export async function addressGivenByStaff(orderId: string) {
  const done = await db.order.updateMany({
    where: { id: orderId, status: "NEW", paidAt: null, addressAskedAt: { not: null }, addressConfirmedAt: null },
    data: { addressConfirmedAt: new Date() },
  });
  if (!done.count) return false;
  await continueToPayment(orderId, "Staff added the delivery address");
  return true;
}

/** Saves an address on the customer (for next time) and, when given, on the order. */
async function saveOnCustomer(customerId: string, text: string, next: DeliveryAddress, area?: string | null) {
  const cust = await db.customer.findUnique({ where: { id: customerId }, select: { name: true, region: true, client: { select: { homeCity: true } } } });
  if (!cust) return;
  const parsed = parseAddressText(text, cust.client.homeCity);
  const a = (area || parsed.area || "").trim();
  await db.customer.update({
    where: { id: customerId },
    data: {
      locationRaw: text.slice(0, 500),
      ...(a ? { location: a.slice(0, 80) } : {}),
      ...(parsed.region !== "Not sure" ? { region: parsed.region } : {}),
      deliveryAddress: next as Prisma.InputJsonValue,
      // A customer known only by their number gets the name they typed in the form.
      ...(next.name && cust.name.trim().startsWith("+") ? { name: next.name.slice(0, 80) } : {}),
    },
  });
}

/** A new address (form, typed or a location): onto the waiting order and on to payment, or onto an open order. */
async function applyNewAddress(customerId: string, text: string, next: DeliveryAddress, area?: string | null) {
  await saveOnCustomer(customerId, text, next, area);
  const waiting = await awaitingAddressOrder(customerId);
  if (waiting) {
    const done = await db.order.updateMany({
      where: { id: waiting.id, addressConfirmedAt: null },
      data: { note: text.slice(0, 500), addressConfirmedAt: new Date(), mapUrl: next.mapUrl ?? null },
    });
    if (done.count) await continueToPayment(waiting.id, "Customer gave the delivery address");
    return;
  }
  // Already past the address step (e.g. they changed their mind before packing): update the open order.
  const open = await changeableOrder(customerId);
  const cust = open?.customer ?? (await db.customer.findUnique({ where: { id: customerId } }));
  if (!cust) return;
  if (open) {
    await db.order.update({ where: { id: open.id }, data: { note: text.slice(0, 500), mapUrl: next.mapUrl ?? null, addressConfirmedAt: open.addressConfirmedAt ?? new Date() } });
    pushOrderToSheet(open.id, "ORDER_UPDATE", "Customer changed the delivery address");
    await textInWindow(cust, `Thank you! Order ${orderRef(open)} will be delivered to:\n📍 ${text}`, "Address saved").catch(() => {});
  } else {
    await textInWindow(cust, `Thank you! We've saved your delivery address for your next order:\n📍 ${text}`, "Address saved").catch(() => {});
  }
}

type InboundForAddress = {
  type?: string;
  interactive?: { type?: string; nfm_reply?: { name?: string; response_json?: string; body?: string } };
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
};

/**
 * A customer's message that answers the address step: the address form, a shared location, a typed address or a
 * "yes" to the saved one. Returns true when it was used (so no automatic catalogue reply goes out for it).
 */
export async function handleAddressReply(customer: { id: string }, m: InboundForAddress, text: string): Promise<boolean> {
  // 1. The address form.
  const nfm = m.interactive?.nfm_reply;
  if (nfm && (nfm.name === "address_message" || !nfm.name)) {
    const v = formValuesFrom(nfm.response_json);
    if (!v) return false;
    const errors = formErrors(v);
    if (errors) {
      const waiting = await awaitingAddressOrder(customer.id);
      const order = waiting ?? (await changeableOrder(customer.id));
      if (order) await sendForm(order, { values: v, errors: errors as Record<string, string> }).catch(() => textInWindow(order.customer, `Please send your full address with the 6-digit pincode for order ${orderRef(order)}.`, "Address request").catch(() => {}));
      return true;
    }
    const line = formAddressText(v);
    await applyNewAddress(customer.id, line, { ...v, savedAt: new Date().toISOString() }, v.landmark_area || v.city);
    return true;
  }

  // 2. A shared location: the address for a waiting order, or a map pin added to an open one.
  if (m.type === "location" && m.location) {
    const pin = locationAddress(m.location);
    const waiting = await awaitingAddressOrder(customer.id);
    if (waiting) {
      await applyNewAddress(customer.id, pin.text, { address: pin.text, ...(pin.lat != null && pin.lng != null ? { lat: pin.lat, lng: pin.lng } : {}), ...(pin.mapUrl ? { mapUrl: pin.mapUrl } : {}), savedAt: new Date().toISOString() });
      return true;
    }
    const open = await changeableOrder(customer.id);
    if (!open || !pin.mapUrl) return false;
    // The address is already known: keep it and add the pin, so the delivery person can find the door.
    await db.order.update({ where: { id: open.id }, data: { mapUrl: pin.mapUrl } });
    const prev = (open.customer.deliveryAddress && typeof open.customer.deliveryAddress === "object" ? open.customer.deliveryAddress : {}) as DeliveryAddress;
    await db.customer.update({ where: { id: customer.id }, data: { deliveryAddress: { ...prev, lat: pin.lat ?? undefined, lng: pin.lng ?? undefined, mapUrl: pin.mapUrl } as Prisma.InputJsonValue } });
    await textInWindow(open.customer, `Thank you! We've added your location to order ${orderRef(open)} for the delivery person.`, "Location saved").catch(() => {});
    return true;
  }

  // 3. Typed while we wait for the address: "yes" to the saved one, or the address itself.
  if (m.type !== "text") return false;
  const waiting = await awaitingAddressOrder(customer.id);
  if (!waiting) return false;
  const saved = waiting.customer.locationRaw?.trim() || waiting.customer.location?.trim();
  if (saved && SAME_ADDRESS_RE.test(text)) {
    await confirmSavedAddress(waiting.id, customer.id);
    return true;
  }
  const client = await db.client.findUnique({ where: { id: waiting.clientId }, select: { homeCity: true } });
  const parsed = parseAddressText(text, client?.homeCity);
  const looksLikeAddress = parsed.isLikelyAddress || (parsed.confidence >= 30 && Boolean(parsed.area || parsed.pincode));
  if (!looksLikeAddress || text.trim().length < 8) return false;
  const line = (parsed.fullAddress || text).trim().slice(0, 500);
  await applyNewAddress(customer.id, line, { address: line, ...(parsed.pincode ? { in_pin_code: parsed.pincode } : {}), savedAt: new Date().toISOString() }, parsed.area);
  return true;
}
