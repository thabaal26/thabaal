"use server";

import { after } from "next/server";
import { cookies } from "next/headers";
import { APP_ORIGIN } from "@/lib/app-host";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { cleanPhone } from "@/lib/lead-stages";
import { addWebsiteLead } from "@/lib/leads";
import { clientIp } from "@/lib/login-guard";
import { processDemoRequestAtomic, RECEIPT_COOKIE_NAME, RECEIPT_TTL_SECONDS } from "@/lib/marketing/receipt";

type DemoValues = { shop: string; person: string; phone: string; town: string; sells: string; plan: string };
/** On a problem the form comes back with what was typed (the browser clears a form after it is sent). */
export type DemoState = {
  ok?: boolean;
  again?: boolean;
  error?: string;
  values?: DemoValues;
  person?: string;
  phone?: string;
  shop?: string;
  redirectTo?: string;
} | undefined;

const PER_IP = 5;
const WINDOW_MS = 60 * 60_000;

/**
 * The website's free demo form: no sign-in, so it protects itself. A hidden field only robots fill in, a few requests
 * an hour from one network, and one open enquiry per number (lib/leads.ts addWebsiteLead). Thabaal gets an email.
 */
export async function requestDemo(_: DemoState, form: FormData): Promise<DemoState> {
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const input = { shop: get("shop"), person: get("person"), phone: get("phone"), town: get("town"), sells: get("sells"), plan: get("plan") };
  // Robots fill in every field, people never see this one: thank them and keep nothing.
  if (get("website")) return { ok: true, person: input.person, phone: cleanPhone(input.phone) ?? input.phone, shop: input.shop };

  const ip = await clientIp();
  const key = `demo:${ip}`;
  const recent = await db.loginAttempt.count({ where: { key, createdAt: { gte: new Date(Date.now() - WINDOW_MS) } } });
  if (recent >= PER_IP) return { error: "Too many requests from this network. Please message us on WhatsApp instead.", values: input };

  const submissionKey = get("submissionKey") || `${input.phone}:${Date.now()}:${Math.random()}`;
  let atomicRes: Awaited<ReturnType<typeof processDemoRequestAtomic>>;
  try {
    atomicRes = await processDemoRequestAtomic({
      input,
      submissionKey,
    });
  } catch (err: any) {
    return { error: err?.message || "Failed to process demo request", values: input };
  }

  const { leadResult: r, conversion } = atomicRes;
  if (!r.ok || !r.id) return { error: r.message, values: input };
  await db.loginAttempt.create({ data: { key } });

  const phone = cleanPhone(input.phone)!;

  try {
    const cookieStore = await cookies();
    cookieStore.set(RECEIPT_COOKIE_NAME, conversion.receiptToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/thank-you",
      maxAge: RECEIPT_TTL_SECONDS,
    });
  } catch (err) {
    const errorName = err instanceof Error && err.name ? err.name : "UnknownError";
    console.error("[DemoConversion] Failed to set receipt cookie; conversion remains fail-closed.", { errorName });
  }

  const sendTask = async () => {
    const sent = await sendEmail({
      subject: r.again ? `Demo asked again: ${input.shop}` : `New demo request: ${input.shop}`,
      intro: r.again ? "They already had an open enquiry; it is back in Follow up today." : "From the free demo form on thabaal.in. It is waiting in Enquiries › Follow up today.",
      button: { label: "Open the enquiry", url: `${APP_ORIGIN}/admin/enquiries/${r.id}` },
      rows: [
        ["Shop", input.shop],
        ["Name", input.person],
        ["WhatsApp", `+91 ${phone}`],
        ["Town", input.town],
        ["Sells", input.sells],
        ["Plan", input.plan],
      ],
    });
    if (!sent.ok) console.warn("Demo request email not sent:", sent.error);
  };

  try {
    after(sendTask);
  } catch {
    void sendTask().catch(() => {});
  }
  return { ok: true, again: r.again ? true : undefined, person: input.person, phone, shop: input.shop, redirectTo: "/thank-you" };
}
