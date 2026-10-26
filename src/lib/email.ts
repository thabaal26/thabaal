import "server-only";

// Email to Thabaal through Resend (https://resend.com), called with fetch: no package needed.
//   RESEND_API_KEY   the API key (required; without it nothing is sent and callers are told so)
//   RESEND_FROM      sender, e.g. "thabaal <requests@thabaal.in>" once that domain is verified in Resend.
//                    Default "thabaal <onboarding@resend.dev>", which Resend only delivers to the email address the
//                    Resend account was created with, so create the account with thabaal26@gmail.com.
//   THABAAL_INBOX    where requests go (default thabaal26@gmail.com)

export const THABAAL_INBOX = process.env.THABAAL_INBOX?.trim() || "thabaal26@gmail.com";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function sendEmail(input: {
  subject: string;
  /** Label → value rows, shown as a table. Values are plain text (escaped here). */
  rows: [string, string][];
  replyTo?: string | null;
  to?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return { ok: false, error: "RESEND_API_KEY is not set" };
  const html =
    `<h2 style="font-family:sans-serif">${esc(input.subject)}</h2><table style="font-family:sans-serif;border-collapse:collapse">` +
    input.rows
      .map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#5a6b7b;vertical-align:top">${esc(k)}</td><td style="padding:6px 0;white-space:pre-wrap">${esc(v || "-")}</td></tr>`)
      .join("") +
    "</table>";
  const text = input.rows.map(([k, v]) => `${k}: ${v || "-"}`).join("\n");
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.RESEND_FROM?.trim() || "thabaal <onboarding@resend.dev>",
        to: [input.to ?? THABAAL_INBOX],
        subject: input.subject,
        html,
        text,
        ...(input.replyTo && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.replyTo) ? { reply_to: input.replyTo } : {}),
      }),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "request failed" };
  }
}
