"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { safeAction, toastResult } from "@/components/toast";
import { useLanguage } from "@/lib/i18n/context";
import { SETTLEMENTS, type PaySettings } from "@/lib/pay-settings";
import Link from "@/components/intent-link";
import { saveBankDetails, savePaySettings, saveReminderRule, saveUpiQr, sendUpiTestLink, type HowPayInput } from "../actions/pay-settings";
import { T } from "../portal-ui";

/** On/off switch in the design's look; saves as soon as it's tapped. */
function Sw({ on, label, busy, onChange }: { on: boolean; label: string; busy?: boolean; onChange: (on: boolean) => void }) {
  return <button type="button" className="sw" role="switch" aria-checked={on} aria-label={label} aria-busy={busy || undefined} disabled={busy} onClick={() => onChange(!on)} />;
}

/** Payments › Payment settings › How customers pay: pay inside WhatsApp, the UPI link and cash on delivery. */
export function HowCustomersPay({
  settings,
  paymentConfig,
  catalogue,
  canManage,
  payTemplate,
}: {
  settings: PaySettings;
  paymentConfig: string | null;
  /** The approved "Review and pay" template in use (needed after the 24-hour window), and our own one's status. */
  payTemplate: { using: string | null; ownName: string; ownStatus: string | null };
  /** A catalogue is connected to the WhatsApp Business account (null when Meta couldn't be asked). */
  catalogue: boolean | null;
  canManage: boolean;
}) {
  const router = useRouter();
  const { isTa } = useLanguage();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [f, setF] = useState<HowPayInput>({
    whatsappPay: settings.whatsappPay,
    upiOn: settings.upiOn,
    upiId: settings.upiId,
    upiName: settings.upiName,
    codOn: settings.codOn,
    codMax: settings.codMax != null ? String(settings.codMax) : "",
    codAreas: settings.codAreas,
  });
  const [qr, setQr] = useState(settings.upiQrUrl);
  const [testLink, setTestLink] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<HowPayInput>) => setF((v) => ({ ...v, ...patch }));

  const save = (next: HowPayInput, changed?: "whatsappPay" | "upiOn" | "codOn") => {
    setBusy(changed ?? "save");
    start(async () => {
      const r = await safeAction(() => savePaySettings(next, changed));
      toastResult(r);
      // A switch that couldn't be turned on (a field missing) goes back to how it was.
      if (r.ok) setF(next);
      else if (changed) setF((v) => ({ ...v, [changed]: !next[changed] }));
      setBusy(null);
      router.refresh();
    });
  };
  const flip = (k: "whatsappPay" | "upiOn" | "codOn", on: boolean) => {
    const next = { ...f, [k]: on };
    setF(next);
    save(next, k);
  };

  async function uploadQr(fl?: File) {
    if (!fl) return;
    if (!fl.type.startsWith("image/")) return toastResult({ ok: false, message: isTa ? "படக் கோப்பைத் தேர்ந்தெடுக்கவும்." : "Pick a picture of your QR code." });
    if (fl.size > 4 * 1024 * 1024) return toastResult({ ok: false, message: isTa ? "படம் 4 MB-க்கு மேல் உள்ளது." : "That picture is over 4 MB." });
    setBusy("qr");
    try {
      const res = await fetch(`/api/upload?filename=${encodeURIComponent(fl.name)}`, { method: "POST", headers: { "Content-Type": fl.type }, body: fl });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? `Server returned ${res.status}`);
      const r = await safeAction(() => saveUpiQr(data.url!));
      toastResult(r);
      if (r.ok) setQr(data.url);
      router.refresh();
    } catch (e) {
      toastResult({ ok: false, message: `${isTa ? "பதிவேற்றம் தோல்வி" : "Upload failed"}: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(null);
      if (file.current) file.current.value = "";
    }
  }

  const dirty =
    f.upiId.trim() !== settings.upiId ||
    f.upiName.trim() !== settings.upiName ||
    f.codMax.trim() !== (settings.codMax != null ? String(settings.codMax) : "") ||
    f.codAreas.trim() !== settings.codAreas;
  const off = !canManage || pending;

  return (
    <section className="card" suppressHydrationWarning>
      <div className="hd" suppressHydrationWarning>
        <div>
          <h2><T ta="வாடிக்கையாளர்கள் பணம் செலுத்தும் முறை">How customers pay</T></h2>
          <p><T ta="நீங்கள் பயன்படுத்துவதை இயக்கவும். ஆர்டர்களும் பணமும் அதற்கேற்ப மாறும்.">Turn on what you use. Orders and Payments change to match.</T></p>
        </div>
      </div>
      {!canManage && (
        <p className="note small" style={{ marginBottom: 12 }}>
          <T ta="இவற்றை மாற்ற நிர்வாகியிடம் கேட்கவும்.">Only a manager can change these. Ask your admin.</T>
        </p>
      )}
      <div className="list">
        <div className="row">
          <div className="grow">
            <div className="t">
              <T ta="WhatsApp-லேயே பணம் செலுத்துதல்">Pay inside WhatsApp</T>{" "}
              {catalogue === true ? (
                <span className="pill ok"><T ta="பட்டியல் இணைக்கப்பட்டது">Catalogue connected</T></span>
              ) : catalogue === false ? (
                <span className="pill warn"><T ta="பட்டியல் இணைக்கப்படவில்லை">No catalogue connected</T></span>
              ) : null}
            </div>
            <div className="muted small">
              <T ta="உங்கள் பட்டியலிலிருந்து ஆர்டர் செய்யும் வாடிக்கையாளர்களுக்கு Review and pay பொத்தான் வரும். ஆர்டர் தானாகவே பணம் பெற்றதாக மாறும்.">
                Customers who order from your catalogue get a Review and pay button. The order turns paid by itself.
              </T>
            </div>
            {/* The configuration name and template are account setup: Settings › WhatsApp payments setup. */}
            <div className="muted small" style={{ marginTop: 6 }}>
              {paymentConfig ? (
                <>
                  <T ta={`பேமெண்ட் கான்ஃபிகரேஷன்: ${paymentConfig}`}>{`Payment configuration: ${paymentConfig}`}</T>
                  {payTemplate.using ? null : (
                    <>
                      {" · "}
                      <T ta="அங்கீகரிக்கப்பட்ட டெம்ப்ளேட் இல்லை">no approved template yet</T>
                    </>
                  )}
                  {" · "}
                  <Link className="link" href="/dashboard/settings#payment-setup">
                    <T ta="அமைப்புகளில் மாற்று">Change in Settings</T>
                  </Link>
                </>
              ) : (
                <>
                  <T ta="பேமெண்ட் கான்ஃபிகரேஷன் இன்னும் சேர்க்கப்படவில்லை.">No payment configuration yet.</T>{" "}
                  <Link className="link" href="/dashboard/settings#payment-setup">
                    <T ta="அமைப்புகளில் சேர்க்கவும்">Set it up in Settings</T>
                  </Link>
                </>
              )}
            </div>
          </div>
          <Sw on={f.whatsappPay} label={isTa ? "WhatsApp-லேயே பணம் செலுத்துதல்" : "Pay inside WhatsApp"} busy={busy === "whatsappPay" || off} onChange={(on) => flip("whatsappPay", on)} />
        </div>

        <div className="row">
          <div className="grow">
            <div className="t"><T ta="UPI QR அல்லது பேமெண்ட் இணைப்பு">UPI QR or payment link</T></div>
            <div className="muted small">
              <T ta="அரட்டை மூலம் வரும் ஆர்டர்களுக்கு. QR அல்லது இணைப்பை அனுப்பி, பணம் வந்ததும் “Mark paid” அழுத்தவும்.">
                For orders from chat. You send a QR or link and tap “Mark paid” when the money arrives.
              </T>
            </div>
            <div className="formgrid" style={{ marginTop: 10 }}>
              <div className="field">
                <label htmlFor="ps-upi">UPI ID</label>
                <input id="ps-upi" type="text" autoComplete="off" inputMode="email" placeholder="shopname@okaxis" value={f.upiId} disabled={off} onChange={(e) => set({ upiId: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="ps-upin"><T ta="வாடிக்கையாளருக்குக் காட்டப்படும் பெயர்">Name shown to the customer</T></label>
                <input id="ps-upin" type="text" autoComplete="organization" placeholder={isTa ? "உங்கள் கடையின் பெயர்" : "Your shop's name"} value={f.upiName} disabled={off} onChange={(e) => set({ upiName: e.target.value })} />
              </div>
            </div>
            <div className="tools" style={{ marginTop: 10 }}>
              <input ref={file} type="file" accept="image/*" hidden onChange={(e) => uploadQr(e.target.files?.[0])} />
              {qr && (
                // eslint-disable-next-line @next/next/no-img-element -- the shop's own uploaded QR picture
                <img src={qr} alt={isTa ? "உங்கள் UPI QR" : "Your UPI QR"} width={44} height={44} style={{ borderRadius: 8, border: "1px solid var(--line)", objectFit: "cover" }} />
              )}
              <button type="button" className="btn sm" disabled={off || busy === "qr"} aria-busy={busy === "qr" || undefined} onClick={() => file.current?.click()}>
                {qr ? <T ta="QR படத்தை மாற்று">Change QR image</T> : <T ta="QR படத்தைப் பதிவேற்று">Upload QR image</T>}
              </button>
              {qr && (
                <button
                  type="button"
                  className="btn sm ghost"
                  disabled={off}
                  onClick={() =>
                    start(async () => {
                      const r = await safeAction(() => saveUpiQr(""));
                      toastResult(r);
                      if (r.ok) setQr("");
                      router.refresh();
                    })
                  }
                >
                  <T ta="QR-ஐ நீக்கு">Remove QR</T>
                </button>
              )}
              <button
                type="button"
                className="btn sm"
                disabled={off || busy === "test"}
                aria-busy={busy === "test" || undefined}
                onClick={() => {
                  setBusy("test");
                  start(async () => {
                    const r = await safeAction(() => sendUpiTestLink({ upiId: f.upiId, upiName: f.upiName }));
                    toastResult(r);
                    setTestLink("link" in r && r.link ? r.link : null);
                    setBusy(null);
                  });
                }}
              >
                <T ta="சோதனை இணைப்பை அனுப்பு">Send a test link</T>
              </button>
            </div>
            {testLink && (
              <p className="muted small" style={{ marginTop: 8, overflowWrap: "anywhere" }}>
                <T ta="இந்த இணைப்பை உங்கள் போனில் திறந்து சோதிக்கலாம்:">You can also open this link on your phone to test it:</T>{" "}
                <a className="link" href={testLink}>{testLink}</a>
              </p>
            )}
          </div>
          <Sw on={f.upiOn} label="UPI QR" busy={busy === "upiOn" || off} onChange={(on) => flip("upiOn", on)} />
        </div>

        <div className="row">
          <div className="grow">
            <div className="t"><T ta="டெலிவரியின் போது பணம் (COD)">Cash on delivery</T></div>
            <div className="muted small">
              <T ta="இயக்கத்தில் இருந்தால், ஆர்டர்களை COD எனக் குறிக்கலாம்; ரொக்கம் / COD தாவல் தெரியும்.">When on, orders can be marked COD and the Cash / COD tab appears.</T>
            </div>
            <div className="muted small" style={{ marginTop: 4 }}>
              <T ta="இது இயக்கத்தில் இருந்தால், கார்ட் அனுப்பும் வாடிக்கையாளர்களிடம் 'இப்போதே ஆன்லைனில் செலுத்து' அல்லது 'டெலிவரியின் போது பணம்' எனத் தேர்வு கேட்கப்படும். அணைக்கப்பட்டிருந்தால், பணம் செலுத்தும் செய்தி மட்டும் செல்லும்.">
                When this is on, customers who send a cart are asked to choose Pay now online or Cash on delivery. When it&apos;s off, they only get the pay-now message.
              </T>
            </div>
            <div className="formgrid" style={{ marginTop: 10 }}>
              <div className="field">
                <label htmlFor="ps-codmax"><T ta="அதிகபட்ச COD ஆர்டர் (₹)">Highest COD order allowed (₹)</T></label>
                <input id="ps-codmax" type="number" inputMode="numeric" min={1} placeholder={isTa ? "வரம்பு இல்லை" : "No limit"} value={f.codMax} disabled={off} onChange={(e) => set({ codMax: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="ps-codar"><T ta="COD அனுமதிக்கப்படும் பகுதிகள்">Areas where COD is allowed</T></label>
                <input id="ps-codar" type="text" placeholder={isTa ? "எல்லா இடங்களும்" : "Everywhere (or e.g. Madurai city)"} value={f.codAreas} disabled={off} onChange={(e) => set({ codAreas: e.target.value })} />
              </div>
            </div>
          </div>
          <Sw on={f.codOn} label={isTa ? "டெலிவரியின் போது பணம்" : "Cash on delivery"} busy={busy === "codOn" || off} onChange={(on) => flip("codOn", on)} />
        </div>
      </div>
      {canManage && (
        <div className="tools" style={{ marginTop: 14 }}>
          <button type="button" className="btn primary" disabled={pending || !dirty} aria-busy={busy === "save" || undefined} onClick={() => save(f)}>
            <T ta="அமைப்புகளைச் சேமி">Save settings</T>
          </button>
        </div>
      )}
      <div className="note small" style={{ marginTop: 14 }}>
        <b><T ta="ஆர்டர் வழிமுறை: ">How an order flows: </T></b>
        <T ta="சலுகை செய்தி › Order now › பட்டியல் › கார்ட் › Review and pay › பணம் வந்தது. பட்டியல் இல்லாத ஆர்டர்கள் UPI QR, பேமெண்ட் இணைப்பு அல்லது COD மூலம் செல்லும்.">
          offer message › Order now › catalogue › cart › Review and pay › paid. Orders without a catalogue go through a UPI QR, a payment link, or cash on delivery.
        </T>
      </div>
    </section>
  );
}

/** Payments › Payment settings › Bank account: bank, last 4 digits and settlement; managers only. */
export function BankAccount({ settings }: { settings: PaySettings }) {
  const router = useRouter();
  const { isTa } = useLanguage();
  const dlg = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const [bank, setBank] = useState(settings.bankName);
  const [last4, setLast4] = useState(settings.bankLast4);
  const [settlement, setSettlement] = useState(settings.settlement || SETTLEMENTS[0].id);
  const has = Boolean(settings.bankName || settings.bankLast4);
  const settleTa = SETTLEMENTS.find((s) => s.id === settings.settlement)?.ta;
  return (
    <section className="card" suppressHydrationWarning>
      <div className="hd" suppressHydrationWarning>
        <div>
          <h2><T ta="வங்கிக் கணக்கு">Bank account</T></h2>
          <p><T ta="உங்கள் UPI பணம் வரும் இடம். நீங்கள் மட்டுமே இதைப் பார்க்க முடியும்.">Where your UPI money lands. Only you see this.</T></p>
        </div>
      </div>
      <div className="list">
        <div className="row">
          <div className="grow muted"><T ta="வங்கி">Bank</T></div>
          <span>{settings.bankName || <span className="muted"><T ta="இன்னும் சேர்க்கவில்லை">Not added yet</T></span>}</span>
        </div>
        <div className="row">
          <div className="grow muted"><T ta="கணக்கு">Account</T></div>
          <span>{settings.bankLast4 ? `•••• •••• ${settings.bankLast4}` : <span className="muted">—</span>}</span>
        </div>
        <div className="row">
          <div className="grow muted"><T ta="பணம் வந்து சேரும் முறை">Settlement</T></div>
          <span>{settings.settlement ? <T ta={settleTa}>{settings.settlement}</T> : <span className="muted">—</span>}</span>
        </div>
      </div>
      <div className="tools" style={{ marginTop: 12 }}>
        <button type="button" className="btn sm" onClick={() => dlg.current?.showModal()}>
          {has ? <T ta="வங்கி விவரங்களை மாற்று">Change bank details</T> : <T ta="வங்கி விவரங்களைச் சேர்">Add bank details</T>}
        </button>
      </div>
      <dialog ref={dlg} onClick={(e) => e.target === dlg.current && dlg.current?.close()}>
        <form
          className="dlg"
          method="dialog"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await safeAction(() => saveBankDetails({ bankName: bank, last4, settlement }));
              toastResult(r);
              if (r.ok) {
                dlg.current?.close();
                router.refresh();
              }
            });
          }}
        >
          <h2><T ta="வங்கி விவரங்கள்">Bank details</T></h2>
          <p className="muted small">
            <T ta="பாதுகாப்புக்காக கணக்கு எண்ணின் கடைசி 4 இலக்கங்களை மட்டுமே சேமிக்கிறோம்.">For safety, only the last 4 digits of the account number are kept.</T>
          </p>
          <div className="field">
            <label htmlFor="bk-name"><T ta="வங்கி மற்றும் கிளை">Bank and branch</T></label>
            <input id="bk-name" type="text" placeholder={isTa ? "எ.கா. City Union Bank, மதுரை" : "e.g. City Union Bank, Madurai"} value={bank} onChange={(e) => setBank(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="bk-last4"><T ta="கணக்கு எண்ணின் கடைசி 4 இலக்கங்கள்">Last 4 digits of the account</T></label>
            <input id="bk-last4" type="text" inputMode="numeric" maxLength={4} pattern="\d{4}" placeholder="4821" value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))} required />
          </div>
          <div className="field">
            <label htmlFor="bk-set"><T ta="பணம் வந்து சேரும் முறை">Settlement</T></label>
            <select id="bk-set" value={settlement} onChange={(e) => setSettlement(e.target.value)}>
              {SETTLEMENTS.map((s) => (
                <option key={s.id} value={s.id}>{isTa ? s.ta : s.id}</option>
              ))}
            </select>
          </div>
          <div className="acts">
            <button type="button" className="btn" onClick={() => dlg.current?.close()}>
              <T ta="ரத்து">Cancel</T>
            </button>
            <button type="submit" className="btn primary" disabled={pending} aria-busy={pending || undefined}>
              <T ta="சேமி">Save</T>
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}

const RULES = [
  { key: "remind1", t: "Remind after 1 day", ta: "1 நாள் கழித்து நினைவூட்டு", d: "One polite WhatsApp message with the payment link again.", dta: "பேமெண்ட் இணைப்புடன் ஒரு பணிவான WhatsApp செய்தி மீண்டும்." },
  { key: "remind3", t: "Remind after 3 days", ta: "3 நாள் கழித்து நினைவூட்டு", d: "Last reminder. After this the order is marked expired.", dta: "கடைசி நினைவூட்டல். ஒரு நாள் கழித்தும் செலுத்தாவிட்டால் ஆர்டர் காலாவதியானதாகக் குறிக்கப்படும்." },
  { key: "receipt", t: "Send a receipt when paid", ta: "பணம் வந்ததும் ரசீது அனுப்பு", d: "Customer gets a thank-you message with the amount.", dta: "வாடிக்கையாளருக்கு தொகையுடன் நன்றி செய்தி செல்லும்." },
] as const;

/** Payments › Payment settings › Reminder rules: each switch saves straight away. */
export function ReminderRules({ settings, canManage }: { settings: PaySettings; canManage: boolean }) {
  const router = useRouter();
  const { isTa } = useLanguage();
  const [vals, setVals] = useState({ remind1: settings.remind1, remind3: settings.remind3, receipt: settings.receipt });
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();
  return (
    <section className="card" suppressHydrationWarning>
      <div className="hd" suppressHydrationWarning>
        <div>
          <h2><T ta="நினைவூட்டல் விதிகள்">Reminder rules</T></h2>
          <p><T ta="ஒருமுறை அமைத்தால் போதும். தபால் உங்களுக்காகப் பணத்தை வசூலிக்க நினைவூட்டும்.">Set once. thabaal chases the money for you.</T></p>
        </div>
      </div>
      <div className="list">
        {RULES.map((r) => (
          <div key={r.key} className="row">
            <div className="grow">
              <div className="t"><T ta={r.ta}>{r.t}</T></div>
              <div className="muted small"><T ta={r.dta}>{r.d}</T></div>
            </div>
            <Sw
              on={vals[r.key]}
              label={isTa ? r.ta : r.t}
              busy={!canManage || busy === r.key}
              onChange={(on) => {
                setVals((v) => ({ ...v, [r.key]: on }));
                setBusy(r.key);
                start(async () => {
                  const res = await safeAction(() => saveReminderRule(r.key, on));
                  toastResult(res);
                  if (!res.ok) setVals((v) => ({ ...v, [r.key]: !on }));
                  setBusy(null);
                  router.refresh();
                });
              }}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
