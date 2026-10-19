"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { safeAction, toastResult } from "@/components/toast";
import { useLanguage } from "@/lib/i18n/context";
import { createPaymentTemplate, savePaymentConfig } from "../actions/orders";
import { T } from "../portal-ui";

/**
 * Settings › WhatsApp payments setup: the payment configuration name from WhatsApp Manager and the "Review and pay"
 * template. Account setup done once, so it lives in Settings; Payments › Payment settings only turns it on or off.
 */
export function PaymentSetupForm({
  config,
  template,
  canChange,
}: {
  config: string | null;
  /** The approved "Review and pay" template in use, and our own one's name and status. */
  template: { using: string | null; ownName: string; ownStatus: string | null };
  canChange: boolean;
}) {
  const router = useRouter();
  const { isTa } = useLanguage();
  const [name, setName] = useState(config ?? "");
  const [pending, start] = useTransition();
  const dirty = name.trim() !== (config ?? "");

  return (
    <section id="payment-setup" className="card" style={{ scrollMarginTop: 80 }}>
      <div className="hd">
        <div>
          <h2><T ta="WhatsApp பண அமைப்பு">WhatsApp payments setup</T></h2>
          <p>
            <T ta="WhatsApp Manager-இல் உள்ள பேமெண்ட் கான்ஃபிகரேஷன், Review and pay டெம்ப்ளேட். ஒருமுறை அமைத்தால் போதும்.">
              The payment configuration from WhatsApp Manager and the Review and pay template. Set once.
            </T>
          </p>
        </div>
        <a className="btn sm" href="https://business.facebook.com/wa/manage/payments/" target="_blank" rel="noreferrer noopener">
          <T ta="WhatsApp Manager-ஐத் திற">Open WhatsApp Manager</T>
        </a>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!canChange || !dirty) return;
          start(async () => {
            toastResult(await safeAction(() => savePaymentConfig(name)));
            router.refresh();
          });
        }}
      >
        <div className="formgrid">
          <div className="field">
            <label htmlFor="pay-config"><T ta="பேமெண்ட் கான்ஃபிகரேஷன் பெயர்">Payment configuration name</T></label>
            <input
              id="pay-config"
              type="text"
              autoComplete="off"
              placeholder={isTa ? "எ.கா. shopname_upi" : "e.g. shopname_upi"}
              value={name}
              disabled={!canChange || pending}
              onChange={(e) => setName(e.target.value)}
            />
            <span className="muted small">
              <T ta="WhatsApp Manager › Payment configurations-இல் உள்ளபடியே. காலியாக விட்டால் WhatsApp-லேயே பணம் நின்றுவிடும்.">
                Exactly as WhatsApp Manager › Payment configurations shows it. Leave it empty to stop payments inside WhatsApp.
              </T>
            </span>
          </div>
        </div>
        <div className="tools" style={{ marginTop: 12 }}>
          {template.using ? (
            <span className="pill ok">
              <T ta={`டெம்ப்ளேட் தயார்: ${template.using}`}>{`Template ready: ${template.using}`}</T>
            </span>
          ) : (
            <span className="pill warn">
              <T ta="அங்கீகரிக்கப்பட்ட டெம்ப்ளேட் இல்லை: 24 மணி நேரத்திற்குப் பிறகு அனுப்ப முடியாது">No approved template yet: requests can’t go after the 24-hour window</T>
            </span>
          )}
          {template.ownStatus && template.using !== template.ownName && (
            <span className="muted small">
              {template.ownStatus === "APPROVED"
                ? `${template.ownName} is approved but has no Review and pay button`
                : `${template.ownName}: ${template.ownStatus.toLowerCase().replace(/_/g, " ")}`}
            </span>
          )}
        </div>
        {canChange ? (
          <div className="tools" style={{ marginTop: 12 }}>
            <button type="submit" className="btn primary" disabled={pending || !dirty} aria-busy={pending || undefined}>
              <T ta="சேமி">Save</T>
            </button>
            {!template.ownStatus && (
              <button
                type="button"
                className="btn"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    toastResult(await safeAction(() => createPaymentTemplate()));
                    router.refresh();
                  })
                }
              >
                <T ta={`“${template.ownName}” டெம்ப்ளேட்டை உருவாக்கு`}>{`Create “${template.ownName}” template`}</T>
              </button>
            )}
          </div>
        ) : (
          <p className="muted small" style={{ marginTop: 12 }}>
            <T ta="கடை உரிமையாளர் மட்டுமே இதை மாற்ற முடியும்.">Only the business owner can change this.</T>
          </p>
        )}
      </form>
    </section>
  );
}
