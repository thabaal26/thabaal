"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { safeAction, toastResult } from "@/components/toast";
import { useLanguage } from "@/lib/i18n/context";
import type { PaySettings } from "@/lib/pay-settings";
import { saveOrderHandling } from "../actions/pay-settings";
import { T } from "../portal-ui";

type Step = { t: string; ta: string };

/** What happens when a shop sends customers to its main number, step by step (owner's view and customer's view). */
const CALL_STEPS: Step[] = [
  {
    t: "Your campaigns go from this number. In the template, add a Call button with your main number and a Reply button named View Products. Not a Link button: WhatsApp shows a link's web address under your picture.",
    ta: "உங்கள் கேம்பெயின்கள் இந்த எண்ணிலிருந்து செல்லும். டெம்ப்ளேட்டில் உங்கள் முதன்மை எண்ணுடன் Call பட்டனும், View Products என்ற Reply பட்டனும் சேர்க்கவும். Link பட்டன் வேண்டாம்: அதன் இணைய முகவரியை வாட்ஸ்அப் உங்கள் படத்தின் கீழே காட்டும்.",
  },
  {
    t: "A customer who taps View Products (or asks for prices) gets your price list from your catalogue, in stock items with prices, ending with “To order, call” your main number.",
    ta: "View Products அழுத்தும் (அல்லது விலை கேட்கும்) வாடிக்கையாளருக்கு உங்கள் கேட்டலாகில் இருந்து விலைப் பட்டியல் செல்லும்: இருப்பில் உள்ள பொருட்கள், விலையுடன், கடைசியில் உங்கள் முதன்மை எண்ணை அழைக்கச் சொல்லி.",
  },
  {
    t: "Anyone who writes anything else gets “To order, please call” your main number (at most once in 6 hours). A catalogue cart is not saved as an order: the reply lists its items and asks them to call.",
    ta: "வேறு எதை எழுதினாலும் உங்கள் முதன்மை எண்ணை அழைக்கச் சொல்லும் பதில் செல்லும் (6 மணி நேரத்துக்கு ஒருமுறை). கேட்டலாக் கார்ட் ஆர்டராகச் சேமிக்கப்படாது: அதன் பொருட்களுடன் அழைக்கச் சொல்லும்.",
  },
];

const CHAT_STEPS: Step[] = [
  {
    t: "Your campaigns go from this number. In the template, add a Call button with your main number and a Reply button named Chat to Order. Not a Link button: WhatsApp shows a link's web address under your picture.",
    ta: "உங்கள் கேம்பெயின்கள் இந்த எண்ணிலிருந்து செல்லும். டெம்ப்ளேட்டில் உங்கள் முதன்மை எண்ணுடன் Call பட்டனும், Chat to Order என்ற Reply பட்டனும் சேர்க்கவும். Link பட்டன் வேண்டாம்: அதன் இணைய முகவரியை வாட்ஸ்அப் உங்கள் படத்தின் கீழே காட்டும்.",
  },
  {
    t: "A customer who taps Chat to Order, or writes here, gets one reply: your main number and a Chat to Order button that opens WhatsApp with you there (for a message, at most once in 6 hours).",
    ta: "Chat to Order அழுத்தும் அல்லது இங்கே எழுதும் வாடிக்கையாளருக்கு ஒரு பதில் செல்லும்: உங்கள் முதன்மை எண்ணும், அங்கே உங்களுடன் வாட்ஸ்அப்பைத் திறக்கும் Chat to Order பட்டனும் (செய்திக்கு 6 மணி நேரத்துக்கு ஒருமுறை).",
  },
  {
    t: "A catalogue cart sent here is not saved as an order: the reply carries its items, so the customer just presses send on your main number.",
    ta: "இங்கே அனுப்பப்படும் கேட்டலாக் கார்ட் ஆர்டராகச் சேமிக்கப்படாது: பொருட்கள் பதிலுடன் செல்லும், வாடிக்கையாளர் உங்கள் முதன்மை எண்ணில் அனுப்பினால் போதும்.",
  },
];

const SHARED_STEPS: Step[] = [
  {
    t: "No payment links, UPI, cash on delivery or order reminders go from this number. Customers pay you on your main number.",
    ta: "இந்த எண்ணிலிருந்து பணம் செலுத்தும் இணைப்பு, UPI, COD அல்லது ஆர்டர் நினைவூட்டல் எதுவும் செல்லாது. வாடிக்கையாளர்கள் உங்கள் முதன்மை எண்ணில் பணம் செலுத்துவார்கள்.",
  },
  {
    t: "You answer and take orders on your main number as you do today. Chats here still shows every message, and STOP still stops messages.",
    ta: "இன்று போலவே உங்கள் முதன்மை எண்ணில் பதில் சொல்லி ஆர்டர் எடுப்பீர்கள். இங்கே வரும் ஒவ்வொரு செய்தியும் Chats-ல் தெரியும்; STOP அனுப்பினால் செய்திகள் நிற்கும்.",
  },
];

const local = (digits: string) => digits.replace(/^91(?=\d{10}$)/, "");

/**
 * Payments › Payment settings › How orders work: orders and payments on this WhatsApp number (the order assistant), or
 * on the shop's own main number, where customers who write here are sent. One way at a time.
 */
export function OrderHandling({ settings, canManage }: { settings: PaySettings; canManage: boolean }) {
  const router = useRouter();
  const { isTa } = useLanguage();
  const [, start] = useTransition();
  const savedMode = settings.orderPhone ? "elsewhere" : "here";
  const [mode, setMode] = useState<"here" | "elsewhere">(savedMode);
  const [phone, setPhone] = useState(local(settings.orderPhone));
  const [by, setBy] = useState<"call" | "chat">(settings.orderBy);
  const [busy, setBusy] = useState(false);
  const changed =
    mode !== savedMode || (mode === "elsewhere" && (phone.replace(/\D/g, "") !== local(settings.orderPhone) || by !== settings.orderBy));
  const off = !canManage;
  const save = () => {
    setBusy(true);
    start(async () => {
      const r = await safeAction(() => saveOrderHandling(mode, phone, by));
      toastResult(r);
      setBusy(false);
      router.refresh();
    });
  };
  return (
    <section className="card" suppressHydrationWarning data-testid="order-handling">
      <div className="hd" suppressHydrationWarning>
        <div>
          <h2><T ta="ஆர்டர்கள் எப்படி நடக்கும்">How orders work</T></h2>
          <p>
            <T ta="இந்த வாட்ஸ்அப் எண்ணில் ஆர்டரும் பணமும், அல்லது உங்கள் முதன்மை எண்ணில். ஒரே நேரத்தில் ஒன்று மட்டும்.">
              Orders and payments on this WhatsApp number, or on your own main number. One way at a time.
            </T>
          </p>
        </div>
      </div>
      <div className="list" role="radiogroup" aria-label={isTa ? "ஆர்டர்கள் எப்படி நடக்கும்" : "How orders work"}>
        <label className="row" style={{ cursor: off ? "default" : "pointer" }}>
          <input type="radio" name="order-handling" value="here" checked={mode === "here"} disabled={off} onChange={() => setMode("here")} />
          <div className="grow">
            <div className="t"><T ta="இந்த எண்ணில் ஆர்டரும் பணமும்">Orders and payments on this number</T></div>
            <div className="muted small">
              <T ta="வாடிக்கையாளர்கள் இங்கே கார்ட் அனுப்புகிறார்கள்; தபால் முகவரி, பணம், COD, நினைவூட்டல்கள், ஆர்டர் நிலை எல்லாம் கவனிக்கும்.">
                Customers send carts here; thabaal handles the address, payment, cash on delivery, reminders and order status.
              </T>
            </div>
          </div>
        </label>
        <label className="row" style={{ cursor: off ? "default" : "pointer" }}>
          <input type="radio" name="order-handling" value="elsewhere" checked={mode === "elsewhere"} disabled={off} onChange={() => setMode("elsewhere")} />
          <div className="grow">
            <div className="t"><T ta="வாடிக்கையாளர்களை உங்கள் முதன்மை எண்ணுக்கு அனுப்பு">Send customers to your main number</T></div>
            <div className="muted small">
              <T ta="இந்த எண் உங்கள் செய்திகளை மட்டும் அனுப்பும். ஆர்டரும் பணமும் உங்கள் முதன்மை எண்ணில்.">
                This number only sends your messages. Orders and payments happen on your main number.
              </T>
            </div>
          </div>
        </label>
      </div>
      {mode === "elsewhere" && (
        <div className="stack" style={{ marginTop: 12 }}>
          <div className="field">
            <label htmlFor="oh-phone"><T ta="உங்கள் முதன்மை வாட்ஸ்அப் எண்">Your main WhatsApp number</T></label>
            <input id="oh-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="98765 43210" value={phone} disabled={off} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="oh-by"><T ta="வாடிக்கையாளர்கள் எப்படி ஆர்டர் செய்வார்கள்">Customers order by</T></label>
            <select id="oh-by" value={by} disabled={off} onChange={(e) => setBy(e.target.value === "call" ? "call" : "chat")}>
              <option value="call">{isTa ? "உங்கள் முதன்மை எண்ணை அழைத்து" : "Calling your main number"}</option>
              <option value="chat">{isTa ? "உங்கள் முதன்மை எண்ணில் வாட்ஸ்அப் செய்து" : "WhatsApp chat on your main number"}</option>
            </select>
          </div>
          <div>
            <div className="t" style={{ marginBottom: 6 }}><T ta="இது எப்படி வேலை செய்யும்">How it works</T></div>
            <ol className="muted small" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
              {[...(by === "call" ? CALL_STEPS : CHAT_STEPS), ...SHARED_STEPS].map((s) => (
                <li key={s.t}><T ta={s.ta}>{s.t}</T></li>
              ))}
            </ol>
          </div>
        </div>
      )}
      {canManage && changed && (
        <div className="tools" style={{ marginTop: 12 }}>
          <button type="button" className="btn sm primary" disabled={busy} aria-busy={busy || undefined} onClick={save}>
            <T ta="சேமி">Save</T>
          </button>
        </div>
      )}
    </section>
  );
}
