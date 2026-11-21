import { requireUser } from "@/lib/session";
import { isEmbeddedSignupEnabled } from "@/lib/whatsapp-embedded";
import { ManualSetupWizard } from "../manual-setup-wizard";
import { EmbeddedSignupCard } from "../embedded-signup-card";
import { PortalPage } from "@/app/dashboard/portal-ui";
import Link from "@/components/intent-link";

export const dynamic = "force-dynamic";

export default async function ConnectWhatsAppPage() {
  const user = await requireUser();
  const embeddedEnabled = isEmbeddedSignupEnabled();

  return (
    <PortalPage
      title="Connect WhatsApp Business"
      titleTa="WhatsApp இணைக்கவும்"
      sub="Choose your onboarding method to link your WhatsApp Business Account."
      subTa="உங்கள் WhatsApp வணிக கணக்கை இணைப்பதற்கான முறையை தேர்வு செய்யவும்."
      actions={
        <Link href="/dashboard/settings/whatsapp" className="btn">
          ← Back to Settings
        </Link>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2 items-start">
        {/* Mode 1: Manual Setup */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
              Active & Recommended
            </span>
            <h2 className="text-lg font-bold">Manual Meta App Integration</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Connect your existing Meta Developer App, WhatsApp Business Account, and registered phone numbers with guided verification.
          </p>
          <ManualSetupWizard clientId={user.clientId ?? undefined} />
        </div>

        {/* Mode 2: Embedded Signup */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
              Future Tech Provider
            </span>
            <h2 className="text-lg font-bold">Meta Embedded Signup</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Automated popup onboarding powered by Thabaal&apos;s verified Tech Provider partnership.
          </p>
          <EmbeddedSignupCard enabled={embeddedEnabled} />
        </div>
      </div>
    </PortalPage>
  );
}
