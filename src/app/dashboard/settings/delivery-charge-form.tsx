"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { safeAction, toastResult } from "@/components/toast";
import { useLanguage } from "@/lib/i18n/context";
import { saveDeliveryFee } from "../actions/pay-settings";

/** Settings → Delivery charge: free delivery, or the amount every new order gets. One order can still be changed on it. */
export function DeliveryChargeForm({ current, canChange }: { current: number; canChange: boolean }) {
  const router = useRouter();
  const { isTa } = useLanguage();
  const [free, setFree] = useState(current === 0);
  const [amount, setAmount] = useState(current > 0 ? String(current) : "");
  const [pending, start] = useTransition();
  const next = free ? 0 : Math.round(Number(amount));
  const save = () =>
    start(async () => {
      const r = await safeAction(() => saveDeliveryFee(free, amount));
      toastResult(r);
      if (r.ok) router.refresh();
    });
  const radio = { width: 18, height: 18, flexShrink: 0, accentColor: "var(--brand, #2563eb)" } as const;

  return (
    <section id="delivery-charge" className="card" style={{ scrollMarginTop: 80 }}>
      <div className="hd">
        <div>
          <h2>{isTa ? "டெலிவரி கட்டணம்" : "Delivery charge"}</h2>
          <p>
            {isTa
              ? "ஒவ்வொரு புதிய ஆர்டருக்கும் (WhatsApp கார்ட் அல்லது நீங்கள் சேர்ப்பது) சேர்க்கப்படும் கட்டணம். ஒரு ஆர்டரில் மட்டும் மாற்ற, அந்த ஆர்டரைத் திருத்தவும்."
              : "Added to every new order, from a WhatsApp cart or one you add here. To change it on one order, edit that order."}
          </p>
        </div>
      </div>

      <div className="list" role="radiogroup" aria-label={isTa ? "டெலிவரி கட்டணம்" : "Delivery charge"}>
        <label className="row" style={{ cursor: canChange ? "pointer" : "default", flexWrap: "nowrap", alignItems: "center" }}>
          <input type="radio" name="delivery-fee" checked={free} disabled={!canChange} onChange={() => setFree(true)} style={radio} />
          <div className="grow">
            <div className="t" style={{ fontWeight: 600 }}>{isTa ? "இலவச டெலிவரி" : "Free delivery"}</div>
            <div className="muted small">{isTa ? "புதிய ஆர்டர்களுக்கு டெலிவரி கட்டணம் இல்லை." : "New orders get no delivery charge."}</div>
          </div>
        </label>
        <label className="row" style={{ cursor: canChange ? "pointer" : "default", flexWrap: "nowrap", alignItems: "center" }}>
          <input type="radio" name="delivery-fee" checked={!free} disabled={!canChange} onChange={() => setFree(false)} style={radio} />
          <div className="grow">
            <div className="t" style={{ fontWeight: 600 }}>{isTa ? "டெலிவரி கட்டணம் வசூலிக்கவும்" : "Charge for delivery"}</div>
            <div className="muted small">{isTa ? "ஒவ்வொரு புதிய ஆர்டருக்கும் இந்தத் தொகை சேரும்." : "This amount is added to every new order."}</div>
          </div>
          <input
            id="delivery-fee-amount"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            aria-label={isTa ? "டெலிவரி கட்டணம் (₹)" : "Delivery charge in rupees"}
            placeholder="₹"
            value={amount}
            disabled={!canChange}
            onFocus={() => setFree(false)}
            onChange={(e) => {
              setFree(false);
              setAmount(e.target.value);
            }}
            style={{ width: 110 }}
          />
        </label>
      </div>

      {canChange ? (
        <div className="tools" style={{ marginTop: 12 }}>
          <button type="button" className="btn primary" disabled={pending || next === current} aria-busy={pending} onClick={save}>
            {pending ? (isTa ? "சேமிக்கப்படுகிறது…" : "Saving…") : isTa ? "டெலிவரி கட்டணத்தைச் சேமி" : "Save delivery charge"}
          </button>
          <span className="muted small">
            {isTa
              ? "ஏற்கனவே உள்ள ஆர்டர்கள் மாறாது."
              : "Orders already placed keep their charge."}
          </span>
        </div>
      ) : (
        <p className="muted small" style={{ marginTop: 12 }}>{isTa ? "கடை உரிமையாளர் மட்டுமே டெலிவரி கட்டணத்தை மாற்ற முடியும்." : "Only the business owner can change the delivery charge."}</p>
      )}
    </section>
  );
}
