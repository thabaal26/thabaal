import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader, PickClientNotice } from "@/components/ui";
import { clientAccounts } from "@/lib/senders";
import { getScope } from "@/lib/session";
import { TemplateEditor } from "../template-editor";

export const metadata: Metadata = { title: "New template" };

export default async function NewTemplatePage() {
  const scope = await getScope();
  if (!scope.canManage) redirect("/dashboard/templates");
  if (!scope.clientId) return <><PageHeader title="New template" back={{ href: "/dashboard/templates", label: "Templates" }} /><PickClientNotice what="template" /></>;
  const accounts = (await clientAccounts(scope.clientId)).map((a) => ({ id: a.businessAccountId, label: `${a.labels.join(", ")} · account ${a.businessAccountId}` }));
  return (
    <>
      <PageHeader title="New template" back={{ href: "/dashboard/templates", label: "Templates" }} description="Pick a category, write the message and preview it exactly as customers will see it." />
      <TemplateEditor
        id={null}
        businessName={scope.clientName ?? process.env.BUSINESS_NAME ?? "Your Business"}
        accounts={accounts}
        initial={{
          name: "",
          language: "en",
          category: "MARKETING",
          headerType: "TEXT",
          headerText: "This week's special ☕",
          headerMediaUrl: "",
          body: "Hi {{1}}, enjoy *{{2}}* on your next visit. Show this message at the counter before Sunday.",
          footer: "Reply STOP to unsubscribe",
          buttons: [{ type: "QUICK_REPLY", text: "Interested" }],
          variables: { "1": { source: "first_name" }, "2": { source: "static", value: "20% off" } },
          codeExpiryMins: 10,
          securityNote: true,
          businessAccountId: accounts[0]?.id ?? null,
        }}
      />
    </>
  );
}
