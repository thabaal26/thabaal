import "server-only";
import { db } from "./db";
import { readFlow, type OrderFlowKey } from "./order-flow";
import { readPaySettings, shopDeliveryFee, upiReady, waPayOn, type PaySettings } from "./pay-settings";

/** A client's payment settings, payment configuration name and what can actually be sent. */
export async function paySettingsFor(clientId: string): Promise<{ settings: PaySettings; paymentConfig: string | null; waPay: boolean; upi: boolean }> {
  const c = await db.client.findUnique({ where: { id: clientId }, select: { paySettings: true, paymentConfig: true } });
  const settings = readPaySettings(c?.paySettings, c?.paymentConfig);
  return { settings, paymentConfig: c?.paymentConfig ?? null, waPay: waPayOn(settings, c?.paymentConfig), upi: upiReady(settings) };
}

/** The delivery charge a new order of this client gets (Settings › Delivery charge; 0 is free delivery, and pickup or service shops never charge one). */
export async function deliveryFeeFor(clientId: string): Promise<number> {
  const c = await db.client.findUnique({ where: { id: clientId }, select: { paySettings: true, orderFlow: true } });
  return shopDeliveryFee(readPaySettings(c?.paySettings, null), readFlow(c?.orderFlow));
}

/** The shop's order steps (Settings › Order steps). */
export async function flowFor(clientId: string): Promise<OrderFlowKey> {
  const c = await db.client.findUnique({ where: { id: clientId }, select: { orderFlow: true } });
  return readFlow(c?.orderFlow);
}
