import "server-only";
import { db } from "./db";
import { readPaySettings, upiReady, waPayOn, type PaySettings } from "./pay-settings";

/** A client's payment settings, payment configuration name and what can actually be sent. */
export async function paySettingsFor(clientId: string): Promise<{ settings: PaySettings; paymentConfig: string | null; waPay: boolean; upi: boolean }> {
  const c = await db.client.findUnique({ where: { id: clientId }, select: { paySettings: true, paymentConfig: true } });
  const settings = readPaySettings(c?.paySettings, c?.paymentConfig);
  return { settings, paymentConfig: c?.paymentConfig ?? null, waPay: waPayOn(settings, c?.paymentConfig), upi: upiReady(settings) };
}
