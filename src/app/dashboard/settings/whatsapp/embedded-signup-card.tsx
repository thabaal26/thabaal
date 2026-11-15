"use client";

import { useState } from "react";

interface Props {
  enabled: boolean;
}

export function EmbeddedSignupCard({ enabled }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const supportEmail = "thabaal26@gmail.com";
  const supportPhone = "+91 63791 40626";
  const whatsappUrl = "https://wa.me/916379140626?text=Hi%20Thabaal%20Team%2C%20I%20would%20like%20to%20set%20up%20my%20WhatsApp%20Business%20Account.";

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2500);
  };

  return (
    <>
      <div className="card space-y-4 border-dashed">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-base font-semibold">Meta Embedded Signup</h3>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${enabled ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"}`}>
                {enabled ? "Eligible" : "Coming Soon"}
              </span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              One-click onboarding: &ldquo;Connect with Facebook&rdquo; without manual App creation or developer token generation.
            </p>
          </div>
        </div>

        <div className="rounded-xl bg-muted/30 p-3.5 text-xs text-muted-foreground space-y-2">
          <p>
            🚀 <strong>Automated Tech Provider Onboarding:</strong> Once official Meta Tech Provider verification is complete,
            clients will be able to connect WhatsApp numbers in 60 seconds directly via the Meta Embedded Signup popup.
          </p>
          <p>
            🛡️ In the interim, Super Admins provision clients securely via <strong>Mode A (Manual Provisioning)</strong>, or our support team will configure it for you immediately.
          </p>
        </div>

        <div className="pt-2">
          <button
            type="button"
            onClick={() => {
              if (enabled) {
                // Future live trigger
                alert("Initiating Meta Embedded Signup dialog...");
              } else {
                setShowModal(true);
              }
            }}
            className="btn btn-primary w-full shadow-sm"
          >
            {enabled ? "Continue with Facebook" : "Connect your WhatsApp (Assisted Setup)"}
          </button>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-panel p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-ink">Meta Embedded Signup</h3>
                  <span className="inline-block rounded-full bg-amber-500/20 px-2 py-0.5 text-2xs font-medium uppercase tracking-wider text-amber-800 dark:text-amber-200">
                    Coming Soon · Assisted Setup Available
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-lg p-1 text-muted hover:bg-canvas hover:text-ink"
                aria-label="Close"
              >
                <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm text-ink/80">
              <p>
                Automatic 1-click &ldquo;Connect with Facebook&rdquo; Embedded Signup is currently pending official Meta Tech Provider review.
              </p>
              <p className="text-xs text-muted">
                Our support team handles complete end-to-end Meta App and WhatsApp Business API provisioning for your store within 15 minutes at zero extra cost.
              </p>

              <div className="mt-4 space-y-2.5 rounded-xl border border-line bg-canvas/60 p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted">Contact Platform Support</div>

                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-2xs text-muted">Official Email</div>
                    <a href={`mailto:${supportEmail}`} className="truncate font-mono text-xs font-medium text-ink hover:underline">
                      {supportEmail}
                    </a>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(supportEmail, "email")}
                    className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-muted hover:bg-panel hover:text-ink"
                  >
                    {copiedField === "email" ? "Copied!" : "Copy"}
                  </button>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-line/60 pt-2">
                  <div className="min-w-0">
                    <div className="text-2xs text-muted">Phone &amp; Direct WhatsApp</div>
                    <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="truncate font-mono text-xs font-medium text-ink hover:underline">
                      {supportPhone}
                    </a>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                    >
                      Chat on WhatsApp
                    </a>
                    <button
                      type="button"
                      onClick={() => handleCopy(supportPhone, "phone")}
                      className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-muted hover:bg-panel hover:text-ink"
                    >
                      {copiedField === "phone" ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="btn btn-secondary text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
