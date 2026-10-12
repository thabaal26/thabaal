"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ExternalLink, CheckCircle2, AlertCircle, HelpCircle, ShieldCheck, Landmark, Sparkles } from "@/components/icons";
import { toastResult } from "@/components/toast";
import { Badge, Button, Card, CardHeader, Field } from "@/components/ui";
import { createPaymentTemplate, savePaymentConfig } from "../actions/orders";

/** Manager setting: which WhatsApp payment configuration "Request payment" uses. */
export function PaymentForm({
  config,
  own,
  using,
}: {
  config: string | null;
  own: { name: string; status: string | null };
  using: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tplPending, startTpl] = useTransition();
  const [name, setName] = useState(config ?? "");
  const [showGuide, setShowGuide] = useState(false);

  const isConfigured = Boolean(config && config.trim());

  return (
    <Card>
      <CardHeader
        title="WhatsApp payments & UPI"
        description="Enable customers to pay directly inside WhatsApp using UPI (GPay, PhonePe, Paytm, BHIM) with automated payment confirmation."
        action={
          <Badge tone={isConfigured ? "green" : "gray"} className="shrink-0">
            {isConfigured ? (
              <>
                <CheckCircle2 aria-hidden className="size-3 text-success" /> Active
              </>
            ) : (
              <>
                <AlertCircle className="size-3 text-muted" /> Not configured
              </>
            )}
          </Badge>
        }
      />

      <div className="space-y-4 p-4 sm:p-5">
        {/* Portal capability explanation */}
        <div className="rounded-card border border-line bg-canvas/70 p-3.5 text-xs text-ink sm:text-sm">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="size-5 shrink-0 text-brand-deep mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-ink">
                Is native WhatsApp Payment possible through our portal?
              </p>
              <p className="text-muted leading-relaxed">
                <b className="text-ink">Yes!</b> When configured, our portal automatically sends native{" "}
                <b className="text-ink">&ldquo;Review and pay&rdquo;</b> interactive WhatsApp buttons to customers.
                When paid, Meta sends an instant webhook to this portal, marking the order as <b className="font-semibold text-success">PAID</b> and dispatching an automated WhatsApp receipt.
              </p>
            </div>
          </div>
        </div>

        {/* Bank & UPI linking guide */}
        <div className="ui-card rounded-card border border-line-strong/40 bg-panel p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
              <Landmark className="size-3.5 text-brand" /> Bank Account & UPI Setup
            </span>
            <button
              type="button"
              onClick={() => setShowGuide(!showGuide)}
              className="inline-flex items-center gap-1 text-xs font-medium text-brand-deep hover:underline"
            >
              <HelpCircle className="size-3.5" />
              {showGuide ? "Hide instructions" : "How to link Bank & UPI"}
            </button>
          </div>

          {showGuide && (
            <div className="space-y-2 border-t border-line/60 pt-2.5 text-xs text-muted leading-relaxed">
              <p>
                As required by <b className="text-ink">RBI & NPCI regulations</b>, merchant bank accounts and UPI VPAs must be verified inside your official Meta WhatsApp Business account for security compliance:
              </p>
              <ol className="list-decimal space-y-1 pl-4 text-muted">
                <li>
                  Open your <b className="text-ink">WhatsApp Manager → Payment configurations</b>.
                </li>
                <li>
                  Link your payment gateway (Razorpay, PayU, Cashfree) or add your direct <b className="text-ink">Bank Account & UPI VPA</b>.
                </li>
                <li>
                  Meta provides a <b className="text-ink">Configuration Name</b> (e.g. <code>rgfoodproducts</code>).
                </li>
                <li>
                  Enter that configuration name below to activate automated payment requests from this portal.
                </li>
              </ol>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <span className="text-xs text-muted">
              Configure your merchant bank & UPI in WhatsApp Business:
            </span>
            <a
              href="https://business.facebook.com/wa/manage/payments/"
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-control border border-line bg-canvas px-3 text-xs font-semibold text-brand-deep hover:bg-brand-soft/50 sm:min-h-8"
            >
              <span>WhatsApp Manager Payments</span>
              <ExternalLink className="size-3" />
            </a>
          </div>
        </div>

        {/* Form to save Payment Configuration Name */}
        <form
          className="space-y-4 pt-1"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              toastResult(await savePaymentConfig(name));
              router.refresh();
            });
          }}
        >
          <Field
            id="pay-config"
            label="Payment configuration name"
            help={`Template status: ${
              using
                ? `Active using template "${using}"`
                : "None approved yet (use Meta Template library or wait for approval)"
            }${
              using === own.name
                ? ""
                : ` (custom "${own.name}" is ${
                    own.status ? own.status.toLowerCase() : "not created yet"
                  })`
            }.`}
          >
            <input
              className="field"
              autoComplete="off"
              value={name}
              placeholder="e.g. rgfoodproducts or business_upi"
              onChange={(e) => setName(e.target.value)}
            />
          </Field>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              className="max-sm:w-full"
              disabled={name.trim() === (config ?? "")}
              loading={pending}
            >
              Save configuration
            </Button>
            {!own.status && (
              <Button
                type="button"
                variant="secondary"
                className="max-sm:w-full"
                loading={tplPending}
                onClick={() =>
                  startTpl(async () => {
                    toastResult(await createPaymentTemplate());
                    router.refresh();
                  })
                }
              >
                <Sparkles aria-hidden className="size-4" /> Create &ldquo;{own.name}&rdquo; template
              </Button>
            )}
          </div>
        </form>
      </div>
    </Card>
  );
}
