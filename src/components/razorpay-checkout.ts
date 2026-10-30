"use client";

// Opens Razorpay's checkout for an order or subscription the server just created, and hands the result back to
// the server to confirm (app/dashboard/actions/razorpay.ts rzpConfirm). The browser never decides what was paid.

type Start = { kind: "subscription" | "order"; id: string; keyId: string; amountPaise: number; label: string };
export type CheckoutOutcome = { status: "paid"; paymentId: string; signature: string } | { status: "closed" } | { status: "failed"; message: string };

type RazorpayResponse = { razorpay_payment_id: string; razorpay_signature: string };
type RazorpayInstance = { open: () => void; on: (event: string, cb: (r: { error?: { description?: string } }) => void) => void };
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

let loading: Promise<void> | null = null;
function loadScript() {
  if (window.Razorpay) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = null;
      reject(new Error("Couldn't load Razorpay. Check your internet and try again."));
    };
    document.body.appendChild(s);
  });
  return loading;
}

export async function openRazorpay(start: Start, prefill: { name?: string; email?: string; contact?: string } = {}): Promise<CheckoutOutcome> {
  try {
    await loadScript();
  } catch (e) {
    return { status: "failed", message: e instanceof Error ? e.message : "Couldn't load Razorpay." };
  }
  return new Promise<CheckoutOutcome>((resolve) => {
    let settled = false;
    const finish = (o: CheckoutOutcome) => {
      if (!settled) {
        settled = true;
        resolve(o);
      }
    };
    const rz = new window.Razorpay!({
      key: start.keyId,
      name: "Thabaal",
      description: start.label,
      image: `${window.location.origin}/brands/thabaal/mark.png`,
      ...(start.kind === "subscription" ? { subscription_id: start.id } : { order_id: start.id, amount: start.amountPaise, currency: "INR" }),
      prefill: {
        ...(prefill.name ? { name: prefill.name } : {}),
        ...(prefill.email ? { email: prefill.email } : {}),
        ...(prefill.contact ? { contact: prefill.contact } : {}),
      },
      theme: { color: "#0d1b2a" },
      handler: (r: RazorpayResponse) => finish({ status: "paid", paymentId: r.razorpay_payment_id, signature: r.razorpay_signature }),
      modal: { ondismiss: () => finish({ status: "closed" }), confirm_close: true },
    });
    // A failed attempt keeps the checkout open so the person can try another way; it only ends when they close it.
    rz.on("payment.failed", () => {});
    rz.open();
  });
}
