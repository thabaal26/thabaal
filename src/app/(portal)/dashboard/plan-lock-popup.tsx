"use client";

// "Subscribe to continue": shown to a business whose plan isn't active (lib/plan-access.ts) once when it opens the
// portal, and every time it tries to change something (the server refused with PLAN_LOCKED_MESSAGE; toast.tsx
// turns that into this popup). Every page stays open to look around; customer messages keep arriving.

import Link from "@/components/intent-link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { PLAN_LOCKED_EVENT } from "@/lib/plan-lock-paths";

const SEEN = "thabaal-plan-popup-seen";

export function PlanLockPopup({ canPay }: { canPay: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const path = usePathname();
  const onAccount = path?.startsWith("/dashboard/account") ?? false;

  useEffect(() => {
    const open = () => {
      if (ref.current && !ref.current.open) ref.current.showModal();
    };
    window.addEventListener(PLAN_LOCKED_EVENT, open);
    // Once per visit, not on My account (that is where they pay).
    try {
      if (!onAccount && !sessionStorage.getItem(SEEN)) {
        sessionStorage.setItem(SEEN, "1");
        open();
      }
    } catch {
      // Storage blocked: the popup still comes with the first change they try.
    }
    // Any button or switch on a page (outside My account) answers with the popup before it does anything.
    // Moving around stays open: links, the menu, tabs, filters (aria-pressed), "more" toggles (aria-expanded),
    // search boxes and typing, and anything marked data-lock-free (the Connect WhatsApp card).
    const onClick = (e: MouseEvent) => {
      if (onAccount) return;
      const el = (e.target as Element | null)?.closest?.("button, [role='switch'], input[type='submit']");
      if (!el || !el.closest("#main") || el.closest("[data-testid='plan-lock-popup'], [data-lock-free], [role='tablist']")) return;
      if (el.getAttribute("role") === "tab" || el.hasAttribute("aria-pressed") || el.hasAttribute("aria-expanded")) return;
      e.preventDefault();
      e.stopPropagation();
      open();
    };
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener(PLAN_LOCKED_EVENT, open);
      document.removeEventListener("click", onClick, true);
    };
  }, [onAccount]);

  const close = () => ref.current?.close();
  return (
    <dialog ref={ref} aria-labelledby="plan-popup-title" onClick={(e) => e.target === ref.current && close()} data-testid="plan-lock-popup">
      <div className="dlg">
        <h2 id="plan-popup-title">Subscribe to continue</h2>
        <p className="muted" style={{ marginTop: -4 }}>
          Your thabaal plan isn&apos;t active. You can open every page and look around, but sending messages, saving and other changes start again
          the moment you subscribe.
        </p>
        <p className="muted small">
          Nothing is deleted. Customer messages keep arriving on WhatsApp, and your customers, orders and products are all here.
        </p>
        {!canPay && <p className="small">Ask the business owner to subscribe in My account.</p>}
        <div className="acts">
          <button type="button" className="btn" onClick={close}>
            Not now
          </button>
          <a className="btn" href="https://wa.me/916379140626?text=Hi%20thabaal%2C%20I%20need%20help%20with%20my%20subscription" target="_blank" rel="noopener noreferrer">
            WhatsApp thabaal
          </a>
          {canPay && (
            <Link className="btn primary" href="/dashboard/account?pay=now" onClick={close}>
              Start subscription
            </Link>
          )}
        </div>
      </div>
    </dialog>
  );
}
