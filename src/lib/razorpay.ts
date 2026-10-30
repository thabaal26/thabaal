import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Razorpay REST API, called with fetch (no package). Keys come only from the environment:
//   RAZORPAY_KEY_ID          rzp_live_... or rzp_test_... (public; the browser checkout needs it)
//   RAZORPAY_KEY_SECRET      server only: API calls and checkout signatures
//   RAZORPAY_WEBHOOK_SECRET  server only: the secret typed in Razorpay → Webhooks, checks webhook signatures

const API = "https://api.razorpay.com/v1";

export function razorpayKeys() {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const secret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !secret) return null;
  return { keyId, secret, mode: keyId.startsWith("rzp_live_") ? ("live" as const) : ("test" as const) };
}

export const razorpayReady = () => razorpayKeys() !== null;

export class RazorpayError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

/** One API call. Throws RazorpayError with Razorpay's own description when the call fails. */
export async function rzp<T = Record<string, unknown>>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<T> {
  const k = razorpayKeys();
  if (!k) throw new RazorpayError("Razorpay keys are not set (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET).", 500, "not_configured");
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${k.keyId}:${k.secret}`).toString("base64")}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  if (!res.ok) {
    const err = (data as { error?: { description?: string; code?: string } } | null)?.error;
    throw new RazorpayError(err?.description || `Razorpay ${res.status}`, res.status, err?.code);
  }
  return data as T;
}

const hmac = (secret: string, payload: string) => createHmac("sha256", secret).update(payload).digest("hex");

function sameHex(a: string, b: string) {
  if (!/^[0-9a-f]+$/i.test(a) || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/** Checkout success for an order: signature = HMAC(order_id|payment_id, key secret). */
export function orderSignatureOk(orderId: string, paymentId: string, signature: string) {
  const k = razorpayKeys();
  return !!k && sameHex(signature, hmac(k.secret, `${orderId}|${paymentId}`));
}

/** Checkout success for a subscription: signature = HMAC(payment_id|subscription_id, key secret). */
export function subscriptionSignatureOk(subscriptionId: string, paymentId: string, signature: string) {
  const k = razorpayKeys();
  return !!k && sameHex(signature, hmac(k.secret, `${paymentId}|${subscriptionId}`));
}

/** Webhook: X-Razorpay-Signature = HMAC(raw body, webhook secret). */
export function webhookSignatureOk(rawBody: string, signature: string | null) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  return !!secret && !!signature && sameHex(signature, hmac(secret, rawBody));
}

export type RzpPayment = {
  id: string;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  order_id: string | null;
  invoice_id?: string | null;
  method?: string;
  email?: string;
  contact?: string;
  error_description?: string | null;
};

/**
 * Fetches a payment from Razorpay and makes sure the money is captured: an authorized payment (accounts set to
 * manual capture) is captured here for its own amount. Returns the payment as Razorpay now reports it.
 */
export async function capturedPayment(paymentId: string): Promise<RzpPayment> {
  let p = await rzp<RzpPayment>("GET", `/payments/${encodeURIComponent(paymentId)}`);
  if (p.status === "authorized") {
    try {
      p = await rzp<RzpPayment>("POST", `/payments/${encodeURIComponent(paymentId)}/capture`, { amount: p.amount, currency: p.currency });
    } catch (e) {
      // Captured meanwhile (auto-capture or a webhook got there first): read it again.
      if (!(e instanceof RazorpayError)) throw e;
      p = await rzp<RzpPayment>("GET", `/payments/${encodeURIComponent(paymentId)}`);
    }
  }
  return p;
}
