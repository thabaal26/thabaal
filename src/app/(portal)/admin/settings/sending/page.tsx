import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { requireAdminPage } from "@/lib/session";
import { PortalSendingSettings } from "@/app/dashboard/settings/portal-sending";
import { PageHead } from "../../ui";

export const metadata: Metadata = { title: "Sending and look" };
export const dynamic = "force-dynamic";

/** Admin › Settings › Sending and look: the portal-wide WhatsApp provider, default Meta number, scheduler and look. */
export default async function SendingSettingsPage() {
  await requireAdminPage();
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  return (
    <>
      <PageHead
        title="Sending and look"
        sub="Which WhatsApp connection sends, the default Meta number, the scheduler, and the portal's default look. Each business's own number and look are on its client page."
        tools={
          <Link className="btn sm" href="/admin/settings">
            Back to Settings
          </Link>
        }
      />
      <div className="thabaal-portal">
        <PortalSendingSettings origin={origin} />
      </div>
    </>
  );
}
