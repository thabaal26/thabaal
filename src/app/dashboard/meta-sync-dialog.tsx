"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, ExternalLink, RefreshCw, Smartphone, Sparkles, Wallet } from "lucide-react";
import { toastResult } from "@/components/toast";
import { Button, Field } from "@/components/ui";
import { Sheet } from "@/components/sheet";
import { syncMetaAccountBalanceAction, refreshMetaLiveStatusAction } from "./actions/spend";
import type { MetaAccountRecord } from "@/lib/meta-balance";

type Props = {
  metaAccount: MetaAccountRecord;
  clientId: string;
  displayPhone?: string | null;
  qualityRating?: string | null;
};

export function MetaSyncDialog({ metaAccount, clientId, displayPhone, qualityRating }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState(metaAccount.liveBalance.toString());
  const [isPending, startTransition] = useTransition();
  const [isVerifying, startVerifying] = useTransition();

  const handleSync = (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(balance);
    if (isNaN(num) || num < 0) return;

    startTransition(async () => {
      const res = await syncMetaAccountBalanceAction(metaAccount.wabaId, num);
      toastResult(res);
      if (res.ok) {
        setOpen(false);
        router.refresh();
      }
    });
  };

  const handleVerifyStatus = () => {
    startVerifying(async () => {
      const res = await refreshMetaLiveStatusAction(clientId);
      toastResult(res);
      if (res.ok) {
        router.refresh();
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setBalance(metaAccount.liveBalance.toString());
          setOpen(true);
        }}
        className="inline-flex min-h-8 items-center gap-1.5 rounded-control border border-line-strong/60 bg-panel px-3 text-xs font-semibold text-ink shadow-xs transition hover:border-brand hover:text-brand-deep hover:bg-surface active:bg-sunken"
        title="Sync balance with Meta Business Suite or update prepaid wallet"
      >
        <RefreshCw className="size-3 text-brand" />
        <span>Sync Balance</span>
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Meta WhatsApp Prepaid Balance"
        description="Live wallet balance and account status synced from Meta Business Suite."
      >
        <div className="space-y-4 pt-1 pb-12 sm:pb-1">
          {/* Account Details Box */}
          <div className="rounded-xl border border-line bg-canvas p-3.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-ink">{metaAccount.accountName}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-3xs font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400">
                <CheckCircle2 className="size-3" />
                Active · Green Quality
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-2xs text-muted">
              <div>
                <span className="block text-3xs uppercase tracking-wider text-muted">WABA ID</span>
                <span className="font-mono text-ink">{metaAccount.wabaId}</span>
              </div>
              <div>
                <span className="block text-3xs uppercase tracking-wider text-muted">Payment Account</span>
                <span className="font-mono text-ink">{metaAccount.paymentAccountId}</span>
              </div>
              {displayPhone && (
                <div className="col-span-2">
                  <span className="block text-3xs uppercase tracking-wider text-muted">Sending Phone</span>
                  <span className="font-medium text-ink">{displayPhone}</span>
                </div>
              )}
            </div>
          </div>

          {/* Current Balance Display */}
          <div className="flex items-center justify-between rounded-lg border border-brand/20 bg-brand-soft/30 p-3">
            <div>
              <p className="text-3xs uppercase tracking-wider font-semibold text-brand-deep">Current Meta Balance</p>
              <p className="text-xl font-bold tabular text-ink">
                ₹{metaAccount.liveBalance.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <a
              href={metaAccount.billingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
            >
              <span>Open Meta Billing</span>
              <ExternalLink className="size-3" />
            </a>
          </div>

          {/* Update / Sync Form */}
          <form onSubmit={handleSync} className="space-y-3">
            <Field id="meta-balance-input" label="Update Synced Balance (₹)" hint="from Meta Billing Hub">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted">₹</span>
                <input
                  id="meta-balance-input"
                  type="number"
                  step="0.01"
                  min="0"
                  max="1000000"
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                  className="field tabular pl-7 font-medium"
                  placeholder="18.89"
                  required
                />
              </div>
            </Field>

            {/* Quick Presets */}
            <div className="flex items-center gap-2">
              <span className="text-3xs text-muted">Quick set:</span>
              {[18.89, 50, 100, 500, 1000].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setBalance(val.toString())}
                  className="rounded border border-line bg-panel px-2 py-0.5 text-2xs font-medium text-ink transition hover:border-brand hover:text-brand"
                >
                  ₹{val}
                </button>
              ))}
            </div>

            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={isVerifying}
                onClick={handleVerifyStatus}
              >
                <RefreshCw className="size-3.5" />
                <span>Verify Meta API</span>
              </Button>

              <div className="flex gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" loading={isPending}>
                  <Check className="size-3.5" />
                  <span>Save & Sync</span>
                </Button>
              </div>
            </div>
          </form>
        </div>
      </Sheet>
    </>
  );
}
