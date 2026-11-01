"use client";

// Settings › Order steps › Order update templates: once a customer's 24-hour window has closed, WhatsApp only lets an
// order update go as an approved template. Shows the ones this shop's order steps need and creates the missing ones.

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { safeAction, toastResult } from "@/components/toast";
import { useLanguage } from "@/lib/i18n/context";
import { createOrderTemplates } from "../actions/orders";

export type OrderTemplateRow = { name: string; status: string | null };

const PURPOSE: Record<string, [string, string]> = {
  order_confirmation: ["Order confirmed", "ஆர்டர் உறுதியானது"],
  order_dispatched: ["Dispatched", "அனுப்பப்பட்டது"],
  order_delivered: ["Delivered", "டெலிவரி ஆனது"],
  order_cancelled: ["Cancelled", "ரத்து செய்யப்பட்டது"],
  order_confirmation_pickup: ["Order confirmed", "ஆர்டர் உறுதியானது"],
  order_ready_pickup: ["Ready for pickup", "எடுக்கத் தயார்"],
  booking_confirmation: ["Booking confirmed", "முன்பதிவு உறுதியானது"],
};

const STATUS: Record<string, [string, string, string]> = {
  APPROVED: ["Approved", "அனுமதிக்கப்பட்டது", "var(--ok, #15803d)"],
  PENDING: ["In review", "பரிசீலனையில்", "var(--warn, #b45309)"],
  DRAFT: ["Not sent", "அனுப்பப்படவில்லை", "var(--muted)"],
  REJECTED: ["Rejected", "நிராகரிக்கப்பட்டது", "var(--bad, #b91c1c)"],
  PAUSED: ["Paused", "நிறுத்தப்பட்டது", "var(--warn, #b45309)"],
  DISABLED: ["Disabled", "முடக்கப்பட்டது", "var(--bad, #b91c1c)"],
};

export function OrderTemplatesCard({ rows, canChange }: { rows: OrderTemplateRow[]; canChange: boolean }) {
  const router = useRouter();
  const { isTa } = useLanguage();
  const [pending, start] = useTransition();
  const missing = rows.filter((r) => !r.status).length;
  const create = () =>
    start(async () => {
      const r = await safeAction(() => createOrderTemplates());
      toastResult(r);
      if (r.ok) router.refresh();
    });

  return (
    <section id="order-templates" className="card" style={{ scrollMarginTop: 80 }}>
      <div className="hd">
        <div>
          <h2>{isTa ? "ஆர்டர் தகவல் டெம்ப்ளேட்கள்" : "Order update templates"}</h2>
          <p>
            {isTa
              ? "வாடிக்கையாளர் கடைசியாக செய்தி அனுப்பி 24 மணி நேரம் ஆன பிறகு, ஆர்டர் தகவல்களை WhatsApp அனுமதித்த டெம்ப்ளேட் மூலம் மட்டுமே அனுப்ப முடியும். உங்கள் ஆர்டர் நிலைகளுக்குத் தேவையானவை இவை."
              : "24 hours after a customer's last message, WhatsApp only lets order updates go as approved templates. These are the ones your order steps need."}
          </p>
        </div>
      </div>
      <div className="list">
        {rows.map((r) => {
          const [label, labelTa] = PURPOSE[r.name] ?? [r.name, r.name];
          const st = r.status ? STATUS[r.status] : null;
          return (
            <div className="row" key={r.name}>
              <div className="grow">
                <div className="t">{isTa ? labelTa : label}</div>
                <div className="muted small">{r.name}</div>
              </div>
              <span className="small" style={{ fontWeight: 600, color: st ? st[2] : "var(--muted)" }}>
                {st ? (isTa ? st[1] : st[0]) : isTa ? "இன்னும் இல்லை" : "Not created"}
              </span>
            </div>
          );
        })}
      </div>
      {canChange && missing > 0 && (
        <div className="tools" style={{ marginTop: 12 }}>
          <button type="button" className="btn primary" disabled={pending} aria-busy={pending} onClick={create}>
            {pending ? (isTa ? "அனுப்பப்படுகிறது…" : "Submitting…") : isTa ? `${missing} டெம்ப்ளேட்களை உருவாக்கு` : `Create ${missing} missing template${missing === 1 ? "" : "s"}`}
          </button>
          <span className="muted small">{isTa ? "Meta பொதுவாக சில நிமிடங்களில் அனுமதிக்கும்." : "Meta usually approves them in a few minutes."}</span>
        </div>
      )}
    </section>
  );
}
