import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader, PickClientNotice } from "@/components/ui";
import { db } from "@/lib/db";
import { previewCustomer } from "@/lib/preview-customer";
import { clientAccounts } from "@/lib/senders";
import { getScope, owned } from "@/lib/session";
import type { TemplateButton, VarMap } from "@/lib/template";
import { TemplateEditor } from "../template-editor";
import { planGate } from "@/app/dashboard/plan-lock";

export const metadata: Metadata = { title: "New template" };

export default async function NewTemplatePage({ searchParams }: PageProps<"/dashboard/templates/new">) {
  const locked = await planGate();
  if (locked) return locked;
  const scope = await getScope();
  if (!scope.canManage) redirect("/dashboard/templates");
  if (!scope.clientId) return <><PageHeader title="New template" back={{ href: "/dashboard/templates", label: "Templates" }} /><PickClientNotice what="template" /></>;
  const accounts = (await clientAccounts(scope.clientId)).map((a) => ({ id: a.businessAccountId, label: `${a.labels.join(", ")} · account ${a.businessAccountId}` }));
  // "Duplicate" on a template card: start from a copy of that template, under a new name.
  const from = (await searchParams).from;
  const previewFor = await previewCustomer(scope.clientId);
  const src = typeof from === "string" ? await db.template.findFirst({ where: { id: from, ...owned(scope), clientId: scope.clientId } }) : null;
  if (src) {
    return (
      <>
        <PageHeader title="Duplicate template" back={{ href: "/dashboard/templates", label: "Templates" }} description={`A copy of ${src.name}. Give it a new name, change what you need and send it to Meta.`} />
        <TemplateEditor
          id={null}
          previewFor={previewFor}
          businessName={scope.clientName ?? process.env.BUSINESS_NAME ?? "Your Business"}
          accounts={accounts}
          initial={{
            name: `${src.name}_copy`.slice(0, 512),
            language: src.language,
            category: src.category,
            headerType: src.headerType,
            headerText: src.headerText ?? "",
            headerMediaUrl: src.headerMediaUrl ?? "",
            body: src.body,
            footer: src.footer ?? "",
            buttons: src.buttons as TemplateButton[],
            variables: src.variables as VarMap,
            codeExpiryMins: src.codeExpiryMins,
            securityNote: src.securityNote,
            businessAccountId: src.businessAccountId ?? accounts[0]?.id ?? null,
          }}
        />
      </>
    );
  }
  return (
    <>
      <PageHeader title="New template" back={{ href: "/dashboard/templates", label: "Templates" }} description="Pick a category, write the message and preview it exactly as customers will see it." />
      <TemplateEditor
        id={null}
        previewFor={previewFor}
        businessName={scope.clientName ?? process.env.BUSINESS_NAME ?? "Your Business"}
        accounts={accounts}
        initial={{
          name: "",
          language: "en",
          category: "MARKETING",
          // A blank message to write (the boxes show what goes where); no made-up offer to delete first.
          headerType: "NONE",
          headerText: "",
          headerMediaUrl: "",
          body: "",
          footer: "Reply STOP to unsubscribe",
          buttons: [],
          variables: {},
          codeExpiryMins: 10,
          securityNote: true,
          businessAccountId: accounts[0]?.id ?? null,
        }}
      />
    </>
  );
}
