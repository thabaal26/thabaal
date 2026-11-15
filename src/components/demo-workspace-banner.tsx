"use client";

import Link from "next/link";
import { useState } from "react";
import type { WorkspaceMode } from "@prisma/client";

interface DemoWorkspaceBannerProps {
  mode?: WorkspaceMode | null;
  clientId?: string | null;
  clientName?: string | null;
}

export function DemoWorkspaceBanner({ mode, clientId, clientName }: DemoWorkspaceBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  // If the workspace is already fully live and active, do not show the banner
  if (!mode || mode === "LIVE_ACTIVE" || dismissed) {
    return null;
  }

  const isPendingPayment = mode === "LIVE_PENDING_PAYMENT";
  const isPendingConnection = mode === "LIVE_PENDING_CONNECTION";

  return (
    <div
      role="region"
      aria-label="Workspace Mode Status"
      className="mb-4 overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-orange-500/10 p-3.5 shadow-sm transition-all sm:p-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300">
            <svg
              className="size-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-amber-800 dark:text-amber-200">
                {isPendingPayment
                  ? "Live Pending Payment"
                  : isPendingConnection
                    ? "Live Pending WhatsApp"
                    : "Demo Workspace"}
              </span>
              <span className="text-xs text-muted">
                {clientName ? `Store: ${clientName}` : "Isolated Sandbox"}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-ink/80 sm:text-sm">
              {isPendingPayment ? (
                <>
                  Your WhatsApp Business credentials are authenticated. To activate real customer broadcast dispatching and start messaging, complete your subscription.
                </>
              ) : isPendingConnection ? (
                <>
                  Your subscription payment is active and verified. Complete your WhatsApp connection in <strong>Settings → WhatsApp</strong> to begin live outbound messaging.
                </>
              ) : (
                <>
                  You are exploring Thabaal in <strong>Demo Mode</strong>. Outbound messages to Meta Graph API are safely simulated with zero real charges. Real customer records and templates are preserved.
                </>
              )}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
          <Link
            href={isPendingConnection ? "/dashboard/settings/whatsapp" : "/dashboard/billing"}
            className="inline-flex h-9 items-center justify-center rounded-xl bg-amber-600 px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-700 active:scale-[0.98] dark:bg-amber-500 dark:text-zinc-950 dark:hover:bg-amber-400"
          >
            {isPendingPayment
              ? "Complete Payment"
              : isPendingConnection
                ? "Connect WhatsApp"
                : "Upgrade to Live"}
          </Link>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            title="Dismiss banner"
            className="flex size-9 items-center justify-center rounded-xl border border-line text-muted transition hover:bg-canvas hover:text-ink"
            aria-label="Dismiss banner"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
