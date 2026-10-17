"use client";

import { useRef, useState, useTransition, type ReactNode } from "react";
import Link from "@/components/intent-link";
import { safeAction, toastResult } from "@/components/toast";
import { useTr } from "@/lib/i18n/context";
import { sendTestMessage } from "../actions/templates";

/** A template card's "Preview": the message as customers see it, what it costs, and a test send to your own number. */
export function TemplatePreview({
  id,
  name,
  summary,
  kind,
  priceBand,
  used,
  why,
  canTest,
  useHref,
  children,
}: {
  id: string;
  name: string;
  summary: string;
  kind: string;
  priceBand: string;
  used: string;
  why?: string | null;
  canTest: boolean;
  useHref?: string | null;
  children: ReactNode;
}) {
  const { isTa, tr } = useTr();
  const dlg = useRef<HTMLDialogElement>(null);
  const [phone, setPhone] = useState("");
  const [pending, start] = useTransition();
  const sendTest = () =>
    start(async () => {
      const res = await safeAction(() => sendTestMessage(id, phone));
      toastResult(res);
    });
  return (
    <>
      <button type="button" className="btn sm" onClick={() => dlg.current?.showModal()}>
        {isTa ? "முன்னோட்டம்" : "Preview"}
      </button>
      <dialog ref={dlg} aria-label={name} onClick={(e) => e.target === dlg.current && dlg.current?.close()}>
        <div className="dlg">
          <div>
            <h2 data-data translate="no" style={{ overflowWrap: "anywhere" }}>
              {name}
            </h2>
            <p className="muted small">{summary}</p>
          </div>
          <div className="phone">{children}</div>
          <div className="list">
            <div className="row">
              <div className="grow muted">{isTa ? "வகை" : "Kind"}</div>
              <b>{tr(kind)}</b>
            </div>
            <div className="row">
              <div className="grow muted">{isTa ? "விலை நிலை" : "Price band"}</div>
              <b>{tr(priceBand)}</b>
            </div>
            <div className="row">
              <div className="grow muted">{isTa ? "பயன்பாடு" : "Used"}</div>
              <b>{tr(used)}</b>
            </div>
            {why && (
              <div className="row">
                <div className="grow muted">{isTa ? "நிராகரிப்புக்கான காரணம்" : "Why rejected"}</div>
                <b>{why}</b>
              </div>
            )}
          </div>
          {canTest && (
            <div className="field">
              <label htmlFor={`tp-${id}`}>{isTa ? "சோதனைக்கு உங்கள் WhatsApp எண்" : "Your WhatsApp number, for a test"}</label>
              <input id={`tp-${id}`} type="tel" inputMode="tel" autoComplete="tel" placeholder="98xxxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          )}
          <div className="acts">
            <button type="button" className="btn" onClick={() => dlg.current?.close()}>
              {isTa ? "மூடு" : "Close"}
            </button>
            {canTest && (
              <button type="button" className="btn" disabled={pending || phone.replace(/\D/g, "").length < 10} onClick={sendTest}>
                {isTa ? "எனக்கு சோதனை அனுப்பு" : "Send me a test"}
              </button>
            )}
            {useHref && (
              <Link className="btn primary" href={useHref}>
                {isTa ? "பிரச்சாரத்தில் பயன்படுத்து" : "Use in campaign"}
              </Link>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
