import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader, PickClientNotice } from "@/components/ui";
import { daysAgo } from "@/lib/format";
import { getScope } from "@/lib/session";
import { CampaignForm } from "../campaign-form";
import { campaignFormData } from "../form-data";

export const metadata: Metadata = { title: "New campaign" };
export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  const scope = await getScope();
  if (!scope.isAdmin) redirect("/dashboard/campaigns");
  if (!scope.clientId) return <><PageHeader title="New campaign" /><PickClientNotice what="campaign" /></>;
  const { templates, audience } = await campaignFormData(scope.clientId);
  const tomorrow = daysAgo(-1).toISOString().slice(0, 10);
  return (
    <>
      <Link href="/dashboard/campaigns" className="-my-2 mb-1 inline-flex items-center gap-1 py-2 text-sm text-muted hover:text-ink sm:mb-3 sm:text-xs">
        <ArrowLeft className="size-3.5" /> Campaigns
      </Link>
      <PageHeader title="New campaign" description={`For ${scope.clientName}. Choose what to send, when to send it and how fast.`} />
      <CampaignForm
        id={null}
        templates={templates}
        audience={audience}
        initial={{
          name: "",
          templateId: templates.find((t) => t.status === "APPROVED")?.id ?? "",
          audienceTag: "",
          scheduleType: "WEEKLY",
          daysOfWeek: [2, 5],
          sendTime: "10:00",
          runDate: tomorrow,
          batchSize: 100,
          intervalMinutes: 10,
          active: true,
        }}
      />
    </>
  );
}
