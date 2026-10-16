import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader, PickClientNotice } from "@/components/ui";
import { daysAgo } from "@/lib/format";
import { getScope } from "@/lib/session";
import { CampaignForm } from "../campaign-form";
import { campaignFormData } from "../form-data";

export const metadata: Metadata = { title: "New campaign" };
export const dynamic = "force-dynamic";

export default async function NewCampaignPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // ?tag=… (from Customers › selected customers, or a group to reach) picks that audience.
  const sp = await searchParams;
  const tag = typeof sp.tag === "string" ? sp.tag.trim().slice(0, 80) : "";
  const scope = await getScope();
  if (!scope.canManage) redirect("/dashboard/campaigns");
  if (!scope.clientId) return <><PageHeader title="New campaign" back={{ href: "/dashboard/campaigns", label: "Campaigns" }} /><PickClientNotice what="campaign" /></>;
  const { templates, audience, numbers } = await campaignFormData(scope.clientId);
  const defaultAccount = numbers[0]?.businessAccountId;
  const tomorrow = daysAgo(-1).toISOString().slice(0, 10);
  return (
    <>
      <PageHeader title="New campaign" back={{ href: "/dashboard/campaigns", label: "Campaigns" }} description={`For ${scope.clientName}. Choose what to send, when to send it and how fast.`} />
      <CampaignForm
        id={null}
        templates={templates}
        audience={audience}
        numbers={numbers}
        initial={{
          name: tag ? `For ${tag.replace(/^aud:/, "saved group ")}` : "",
          templateId: templates.find((t) => t.status === "APPROVED" && (!defaultAccount || !t.businessAccountId || t.businessAccountId === defaultAccount))?.id ?? "",
          senderId: "",
          audienceTag: tag,
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
