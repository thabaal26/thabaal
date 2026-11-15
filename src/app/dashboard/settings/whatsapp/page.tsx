import { requireUser } from "@/lib/session";
import { getClientWhatsAppConnection } from "@/app/dashboard/actions/whatsapp-connect";
import { PortalPage } from "@/app/dashboard/portal-ui";
import Link from "@/components/intent-link";

export const dynamic = "force-dynamic";

export default async function WhatsAppSettingsPage() {
  const user = await requireUser();
  const res = await getClientWhatsAppConnection(user.clientId ?? undefined);
  const data = res.ok && res.data ? res.data : null;

  return (
    <PortalPage
      title="WhatsApp Integration"
      titleTa="WhatsApp இணைப்பு"
      sub="Manage your Meta WhatsApp Business connections, phone numbers, and webhooks."
      subTa="உங்கள் WhatsApp எண்கள் மற்றும் அமைப்புகளை நிர்வகிக்கவும்."
      actions={
        <Link href="/dashboard/settings/whatsapp/connect" className="btn btn-primary">
          {data?.connected ? "Reconnect WhatsApp" : "Connect WhatsApp"}
        </Link>
      }
    >
      <div className="space-y-6">
        {/* Connection Overview Card */}
        <section className="card space-y-4">
          <div className="flex items-center justify-between border-b pb-4">
            <div>
              <h2 className="text-base font-semibold">Connection Status</h2>
              <p className="text-sm text-muted-foreground">
                Current WhatsApp Cloud API integration status for your business.
              </p>
            </div>
            <div>
              {data?.connected ? (
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800">
                  ● ACTIVE
                </span>
              ) : (
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                  ○ NOT CONNECTED
                </span>
              )}
            </div>
          </div>

          {data?.connected ? (
            <div className="grid gap-4 sm:grid-cols-2 text-sm">
              <div>
                <span className="text-xs text-muted-foreground">Onboarding Method</span>
                <p className="font-medium">{data.onboardingMode === "MANUAL" ? "Manual Meta App" : "Embedded Signup"}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">WhatsApp Business Account (WABA ID)</span>
                <p className="font-mono">{data.wabaId || "—"}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Meta App ID</span>
                <p className="font-mono">{data.appId || "—"}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Access Token</span>
                <p className="font-mono">{data.maskedToken || "—"}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Webhook Subscription</span>
                <p className="font-medium text-emerald-600">✓ Active & Verified</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Last Validated</span>
                <p className="text-xs text-muted-foreground">
                  {data.lastValidatedAt ? new Date(data.lastValidatedAt).toLocaleString() : "Recently"}
                </p>
              </div>
            </div>
          ) : (
            <div className="py-6 text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                No active WhatsApp Business integration found for this account.
              </p>
              <Link href="/dashboard/settings/whatsapp/connect" className="btn btn-primary">
                Start WhatsApp Setup Wizard →
              </Link>
            </div>
          )}
        </section>

        {/* Connected Numbers Card */}
        {data?.connected && data.phoneNumbers.length > 0 && (
          <section className="card space-y-4">
            <div>
              <h2 className="text-base font-semibold">Registered Phone Numbers</h2>
              <p className="text-sm text-muted-foreground">
                Phone numbers available for campaigns, automated notifications, and customer chats.
              </p>
            </div>

            <div className="space-y-3">
              {data.phoneNumbers.map((num) => (
                <div key={num.id} className="flex items-center justify-between rounded border p-3">
                  <div>
                    <div className="font-medium text-sm">
                      {num.displayPhone || "Unknown number"} {num.verifiedName ? `(${num.verifiedName})` : ""}
                      {num.isDefault && (
                        <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary font-semibold">
                          Default
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Phone Number ID: {num.phoneNumberId} · Label: {num.label}
                    </div>
                  </div>
                  <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    Connected
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </PortalPage>
  );
}
