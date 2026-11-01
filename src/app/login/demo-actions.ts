"use server";

import { after } from "next/server";
import { APP_ORIGIN } from "@/lib/app-host";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { cleanPhone } from "@/lib/lead-stages";
import { addWebsiteLead } from "@/lib/leads";
import { clientIp } from "@/lib/login-guard";

type DemoValues = { shop: string; person: string; phone: string; town: string; sells: string; plan: string };
/** On a problem the form comes back with what was typed (the browser clears a form after it is sent). */
export type DemoState = { ok?: boolean; again?: boolean; error?: string; values?: DemoValues; person?: string; phone?: string; shop?: string } | undefined;

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

  const r = await addWebsiteLead(input);
  if (!r.ok) return { error: r.message, values: input };
  await db.loginAttempt.create({ data: { key } });

  const phone = cleanPhone(input.phone)!;
  after(async () => {
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
  });
  return { ok: true, again: r.again, person: input.person, phone, shop: input.shop };
}
