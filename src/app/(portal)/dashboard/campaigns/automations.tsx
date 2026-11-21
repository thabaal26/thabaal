"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ScrollReveal } from "@/components/motion";
import Link from "@/components/intent-link";
import { safeAction, toastResult } from "@/components/toast";
import { useLanguage } from "@/lib/i18n/context";
import { templateLabel } from "@/lib/plain-error";
import { saveRefillRule, saveWinbackRule } from "../actions/orders";
import { saveReminderRule, setWhatsappPay } from "../actions/pay-settings";
import { T } from "../portal-ui";

export type AutomationsData = {
  /** Payments › Reminder rules › Remind after 1 day. */
  payReminder: boolean;
  /** Payments › Pay inside WhatsApp, and whether a payment configuration name is saved. */
  waPay: boolean;
  hasPayConfig: boolean;
  /** Reorder reminder: days after an order (null = off) and its template. */
  reorderDays: number | null;
  reorderTemplateId: string | null;
  /** Win-back: days without an order before "lapsed"; a template turns the message on. */
  lapsedDays: number;
  winbackTemplateId: string | null;
  lapsed: number;
  templates: { id: string; name: string }[];
};

function Sw({ on, label, busy, onChange }: { on: boolean; label: string; busy?: boolean; onChange: (on: boolean) => void }) {
  return <button type="button" className="sw" role="switch" aria-checked={on} aria-label={label} aria-busy={busy || undefined} disabled={busy} onClick={() => onChange(!on)} />;
}

function Cat({ c, ta }: { c: string; ta: string }) {
  return (
    <span className="pill mute" style={{ marginLeft: 6 }}>
      <T ta={ta}>{c}</T>
    </span>
  );
}

const ALWAYS = (
  <span className="pill ok">
    <T ta="எப்போதும் இயங்கும்">Always on</T>
  </span>
);

/**
 * Campaigns › Automations: one list of everything that runs on its own. Every switch saves the real setting;
 * reorder reminders and win-back keep their days and template right in their row.
 */
export function Automations({ data, canManage }: { data: AutomationsData; canManage: boolean }) {
  const router = useRouter();
  const { isTamil: isTa } = useLanguage();
  const [, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  const [payReminder, setPayReminder] = useState(data.payReminder);
  const [waPay, setWaPay] = useState(data.waPay);
  const [reorderOn, setReorderOn] = useState(Boolean(data.reorderDays));
  const [reorderDays, setReorderDays] = useState(String(data.reorderDays ?? 30));
  const [reorderTid, setReorderTid] = useState(data.reorderTemplateId ?? data.templates[0]?.id ?? "");
  const [winOn, setWinOn] = useState(Boolean(data.winbackTemplateId));
  const [winDays, setWinDays] = useState(String(data.lapsedDays));
  const [winTid, setWinTid] = useState(data.winbackTemplateId ?? data.templates[0]?.id ?? "");

  /** Runs a save; when it fails, `undo` puts the switch back. */
  const run = (key: string, fn: () => Promise<{ ok: boolean; message?: string }>, undo?: () => void) => {
    setBusy(key);
    start(async () => {
      const r = await safeAction(fn);
      toastResult(r);
      if (!r.ok) undo?.();
      setBusy(null);
      router.refresh();
    });
  };

  const noTemplates = !data.templates.length;
  const reorderDirty = reorderOn && (Number(reorderDays) !== (data.reorderDays ?? 0) || reorderTid !== (data.reorderTemplateId ?? ""));
  const winDirty = Number(winDays) !== data.lapsedDays || (winOn && winTid !== (data.winbackTemplateId ?? ""));
  const off = !canManage;

  const templateSelect = (id: string, value: string, set: (v: string) => void, label: string, labelTa: string) => (
    <div className="field">
      <label htmlFor={id}>
        <T ta={labelTa}>{label}</T>
      </label>
      <select id={id} value={value} disabled={off || noTemplates} onChange={(e) => set(e.target.value)}>
        {noTemplates ? (
          <option value="">{isTa ? "அங்கீகரிக்கப்பட்ட டெம்ப்ளேட்கள் இல்லை" : "No approved templates yet"}</option>
        ) : (
          data.templates.map((t) => (
            <option key={t.id} value={t.id}>
              {templateLabel(t.name)}
            </option>
          ))
        )}
      </select>
    </div>
  );

  return (
    <ScrollReveal as="div" className="card" duration={400}>
      <div className="list" id="au">
        <div className="row">
          <div className="grow">
            <div className="t">
              <T ta="ஆர்டர் தகவல்கள்">Order updates</T> <Cat c="Utility" ta="பயன்பாடு" />
            </div>
            <div className="muted small">
              <T ta="உறுதி, பணம், அனுப்புதல், டெலிவரி, ரத்து செய்திகள் ஒவ்வொரு படியிலும் செல்லும்.">Confirmed, paid, dispatched, delivered and cancelled messages, sent at each order step.</T>
            </div>
          </div>
          {ALWAYS}
        </div>

        <div className="row">
          <div className="grow">
            <div className="t">
              <T ta="பண நினைவூட்டல்">Payment reminder</T> <Cat c="Utility" ta="பயன்பாடு" />
            </div>
            <div className="muted small">
              <T ta="1 நாள் கழித்தும் பணம் செலுத்தவில்லை என்றால், இணைப்புடன் ஒரு பணிவான நினைவூட்டல்.">If a customer has not paid after 1 day, send one gentle reminder with the link.</T>{" "}
              <Link className="link" href="/dashboard/revenue?tab=set">
                <T ta="மேலும் விதிகள்">More rules</T>
              </Link>
            </div>
          </div>
          <Sw
            on={payReminder}
            label={isTa ? "பண நினைவூட்டல்" : "Payment reminder"}
            busy={off || busy === "pay"}
            onChange={(on) => {
              setPayReminder(on);
              run("pay", () => saveReminderRule("remind1", on), () => setPayReminder(!on));
            }}
          />
        </div>

        <div className="row">
          <div className="grow">
            <div className="t">
              <T ta="மறு ஆர்டர் நினைவூட்டல்கள்">Reorder reminders</T> <Cat c="Marketing" ta="சந்தைப்படுத்தல்" />
            </div>
            <div className="muted small">
              <T ta={`ஒரு ஆர்டருக்கு ${Number(reorderDays) || 30} நாட்கள் கழித்து, ஒருமுறை; மீண்டும் ஆர்டர் செய்திருந்தால் இல்லை.`}>
                {`${Number(reorderDays) || 30} days after an order, once, unless they already reordered.`}
              </T>
            </div>
            {reorderOn && (
              <>
                <div className="formgrid" style={{ marginTop: 10 }}>
                  <div className="field">
                    <label htmlFor="au-rd">
                      <T ta="ஆர்டருக்குப் பின் (நாட்கள்)">Days after order</T>
                    </label>
                    <input id="au-rd" type="number" min={1} max={365} inputMode="numeric" disabled={off} value={reorderDays} onChange={(e) => setReorderDays(e.target.value)} />
                  </div>
                  {templateSelect("au-rt", reorderTid, setReorderTid, "Template", "டெம்ப்ளேட்")}
                </div>
                {canManage && reorderDirty && (
                  <div className="tools" style={{ marginTop: 10 }}>
                    <button type="button" className="btn sm primary" disabled={busy === "reorder" || !reorderTid} onClick={() => run("reorder", () => saveRefillRule(Number(reorderDays), reorderTid))}>
                      <T ta="சேமி">Save</T>
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          <Sw
            on={reorderOn}
            label={isTa ? "மறு ஆர்டர் நினைவூட்டல்கள்" : "Reorder reminders"}
            busy={off || busy === "reorder"}
            onChange={(on) => {
              if (on && noTemplates) return toastResult({ ok: false, message: isTa ? "முதலில் ஒரு டெம்ப்ளேட் அங்கீகரிக்கப்பட வேண்டும்." : "Reorder reminders need an approved template first." });
              setReorderOn(on);
              run("reorder", () => saveRefillRule(on ? Number(reorderDays) || 30 : 0, reorderTid), () => setReorderOn(!on));
            }}
          />
        </div>

        <div className="row">
          <div className="grow">
            <div className="t">
              <T ta="பழைய வாடிக்கையாளர்களை மீண்டும் அழைத்தல்">Win-back</T> <Cat c="Marketing" ta="சந்தைப்படுத்தல்" />
            </div>
            <div className="muted small">
              <T ta={`${Number(winDays) || data.lapsedDays} நாட்களாக வாங்காதவர்களுக்கு ஒரு செய்தி. இப்போது ${data.lapsed.toLocaleString("en-IN")} பேர்.`}>
                {`One message to customers who have not bought for ${Number(winDays) || data.lapsedDays} days. ${data.lapsed.toLocaleString("en-IN")} ${data.lapsed === 1 ? "customer is" : "customers are"} lapsed now; they are untagged as soon as they order.`}
              </T>
            </div>
            <div className="formgrid" style={{ marginTop: 10 }}>
              <div className="field">
                <label htmlFor="au-wd">
                  <T ta="இத்தனை நாட்கள் கழித்து">Lapsed after (days)</T>
                </label>
                <input id="au-wd" type="number" min={7} max={365} inputMode="numeric" disabled={off} value={winDays} onChange={(e) => setWinDays(e.target.value)} />
              </div>
              {winOn && templateSelect("au-wt", winTid, setWinTid, "Win-back message", "மீண்டும் அழைக்கும் செய்தி")}
            </div>
            {canManage && winDirty && (
              <div className="tools" style={{ marginTop: 10 }}>
                <button type="button" className="btn sm primary" disabled={busy === "win" || (winOn && !winTid)} onClick={() => run("win", () => saveWinbackRule(Number(winDays), winOn ? winTid : ""))}>
                  <T ta="சேமி">Save</T>
                </button>
              </div>
            )}
          </div>
          <Sw
            on={winOn}
            label={isTa ? "மீண்டும் அழைத்தல்" : "Win-back"}
            busy={off || busy === "win"}
            onChange={(on) => {
              if (on && noTemplates) return toastResult({ ok: false, message: isTa ? "முதலில் ஒரு டெம்ப்ளேட் அங்கீகரிக்கப்பட வேண்டும்." : "Win-back needs an approved template first." });
              setWinOn(on);
              run("win", () => saveWinbackRule(Number(winDays) || data.lapsedDays, on ? winTid : ""), () => setWinOn(!on));
            }}
          />
        </div>

        <div className="row">
          <div className="grow">
            <div className="t">
              <T ta="பொத்தான் அழுத்தலுக்கு பதில்கள்">Replies to button taps</T> <Cat c="Free" ta="இலவசம்" />
            </div>
            <div className="muted small">
              <T ta="“Send price list” அல்லது “Order now” அழுத்துபவர்களுக்கு உடனே பதில் செல்லும்.">Customers who tap “Send price list” or “Order now” get the answer straight away.</T>
            </div>
          </div>
          {ALWAYS}
        </div>

        <div className="row">
          <div className="grow">
            <div className="t">
              <T ta="WhatsApp-லேயே பணம் (UPI)">Pay inside WhatsApp (UPI)</T> <Cat c="Utility" ta="பயன்பாடு" />
            </div>
            <div className="muted small">
              <T ta="GPay, PhonePe, Paytm அல்லது BHIM மூலம் செலுத்தலாம். பணம் வந்த ஆர்டர்கள் குறிக்கப்பட்டு ரசீது செல்லும்.">Customers pay with GPay, PhonePe, Paytm or BHIM. Paid orders are marked and a receipt is sent.</T>
              {!data.hasPayConfig && (
                <>
                  {" "}
                  <Link className="link" href="/dashboard/revenue?tab=set">
                    <T ta="அமைக்கவும்">Set it up</T>
                  </Link>
                </>
              )}
            </div>
          </div>
          <Sw
            on={waPay}
            label={isTa ? "WhatsApp-லேயே பணம்" : "Pay inside WhatsApp"}
            busy={off || busy === "wapay"}
            onChange={(on) => {
              setWaPay(on);
              run("wapay", () => setWhatsappPay(on), () => setWaPay(!on));
            }}
          />
        </div>

        <div className="row">
          <div className="grow">
            <div className="t">
              <T ta="உள்நுழைவு குறியீடுகள்">Login codes</T> <Cat c="Authentication" ta="அங்கீகாரம்" />
            </div>
            <div className="muted small">
              <T ta="யாராவது உள்நுழையும்போது குறியீடுகள் அனுப்பப்படும்.">Codes sent when someone signs in.</T>
            </div>
          </div>
          {ALWAYS}
        </div>

        <div className="row">
          <div className="grow">
            <div className="t">
              <T ta="விளம்பரங்களை நிறுத்து">Stop promotions</T> <Cat c="Free" ta="இலவசம்" />
            </div>
            <div className="muted small">
              <T ta="STOP என பதில் அனுப்புபவர்கள் சலுகைகளிலிருந்து நீக்கப்படுவார்கள்.">Customers who reply STOP are removed from offers.</T>
            </div>
          </div>
          {ALWAYS}
        </div>
      </div>
    </ScrollReveal>
  );
}
