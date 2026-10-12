"use client";

import { Copy, ExternalLink, HelpCircle } from "@/components/icons";
import { toast } from "@/components/toast";
import { buttonClass } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * Meta only shows a business's Billing Hub to someone logged into Facebook with billing access to
 * that business. Anyone else (a new computer, another person's browser, the wrong Facebook account)
 * gets "This content isn't available right now". So beside the direct link this offers: log in
 * first and come straight back to billing, open billing for the whole business (Meta then lets them
 * pick), and copy the link to open in the browser where the right account is logged in.
 */
export function MetaRecharge({ billingUrl, primary = false, className }: { billingUrl: string; primary?: boolean; className?: string }) {
  const businessId = (() => {
    try {
      return new URL(billingUrl).searchParams.get("business_id");
    } catch {
      return null;
    }
  })();
  const loginThenBilling = `https://www.facebook.com/login/?next=${encodeURIComponent(billingUrl)}`;
  const businessBilling = businessId ? `https://business.facebook.com/billing_hub/accounts?business_id=${businessId}` : "https://business.facebook.com/billing_hub/accounts";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(billingUrl);
      toast(true, "Billing link copied. Paste it in the browser where your Meta business account is logged in.");
    } catch {
      toast(false, "Couldn't copy. Long-press or right-click the Recharge button to copy its link.");
    }
  };
  const link = "flex items-start gap-2 rounded-control px-2 py-1.5 text-left text-xs text-ink-2 hover:bg-subtle";
  return (
    <div className={cn("mt-2.5 sm:mt-3", className)}>
      <a href={billingUrl} target="_blank" rel="noopener noreferrer" className={cn(buttonClass(primary ? "primary" : "secondary", "sm"), "w-full")}>
        Recharge on Meta <ExternalLink aria-hidden className="size-3.5" />
        <span className="sr-only">(opens Meta Business Suite)</span>
      </a>
      <details className="group mt-1.5">
        <summary className="flex cursor-pointer list-none items-center justify-center gap-1 text-[11px] font-medium text-muted hover:text-ink-2 [&::-webkit-details-marker]:hidden">
          <HelpCircle aria-hidden className="size-3.5" /> New device, or Meta says &ldquo;content isn&apos;t available&rdquo;?
        </summary>
        <div className="mt-2 space-y-1 rounded-control border border-line bg-panel p-2">
          <p className="px-2 pb-1 text-[11px] leading-snug text-muted">
            Meta opens billing only for a Facebook account that has billing access to this business. Log in with that account first, or ask the business admin to add you (Meta
            Business Settings → Users → People → Finance access).
          </p>
          <a href={loginThenBilling} target="_blank" rel="noopener noreferrer" className={link}>
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-soft text-[10px] font-semibold text-brand-deep">1</span>
            <span>
              <span className="block font-medium text-ink">Log in to Facebook, then go to billing</span>
              Use the account that manages this WhatsApp business.
            </span>
          </a>
          <a href={businessBilling} target="_blank" rel="noopener noreferrer" className={link}>
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-soft text-[10px] font-semibold text-brand-deep">2</span>
            <span>
              <span className="block font-medium text-ink">Open billing for the whole business</span>
              Meta lets you pick the payment account if the direct link doesn&apos;t open.
            </span>
          </a>
          <button type="button" onClick={copy} className={cn(link, "w-full")}>
            <Copy aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
            <span>
              <span className="block font-medium text-ink">Copy the billing link</span>
              To open in another browser or profile where the right account is logged in.
            </span>
          </button>
        </div>
      </details>
    </div>
  );
}
