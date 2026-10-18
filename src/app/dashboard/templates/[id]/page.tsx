import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card, PageHeader, StatusBadge } from "@/components/ui";
import { WhatsAppBubble } from "@/components/whatsapp-preview";
import { db } from "@/lib/db";
import { fmtDate, templateDateLabel } from "@/lib/format";
import { previewCustomer } from "@/lib/preview-customer";
import { getScope, owned } from "@/lib/session";
import { renderFor, type TemplateButton, type VarMap } from "@/lib/template";
import { TemplateEditor } from "../template-editor";

export const metadata: Metadata = { title: "Edit template" };
export const dynamic = "force-dynamic";

export default async function EditTemplatePage({ params }: PageProps<"/dashboard/templates/[id]">) {
  const { id } = await params;
  const scope = await getScope();
  const t = await db.template.findFirst({ where: { id, ...owned(scope) }, include: { client: { select: { name: true } } } });
  if (!t) notFound();

  const back = { href: "/dashboard/templates", label: "Templates" };
  const previewFor = await previewCustomer(t.clientId);

  if (!scope.canManage) {
    const r = renderFor({ ...t, headerText: t.headerText ?? "", footer: t.footer ?? "", variables: t.variables as VarMap }, previewFor);
    return (
      <>
        <PageHeader
          title={t.name}
          titleIsData
          back={back}
          meta={
            <span className="flex flex-wrap items-center gap-2">
              <StatusBadge status={t.status} /> {t.language} · {templateDateLabel(t.createdAt, t.updatedAt)}
            </span>
          }
        />
        <Card className="chat-wall max-w-md p-4 sm:p-5">
          <WhatsAppBubble
            header={r.header}
            headerImage={t.headerType === "IMAGE" ? t.headerMediaUrl : undefined}
            body={r.body}
            footer={r.footer}
            buttons={t.buttons as TemplateButton[]}
          />
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t.name}
        titleIsData
        back={back}
        meta={`${t.client.name} · ${templateDateLabel(t.createdAt, t.updatedAt)}${t.lastSyncedAt ? ` · synced with Meta ${fmtDate(t.lastSyncedAt)}` : ""}`}
      />
      <TemplateEditor
        id={t.id}
        status={t.status}
        statusReason={t.statusReason}
        businessName={t.client.name}
        previewFor={previewFor}
        initial={{
          name: t.name,
          language: t.language,
          category: t.category,
          headerType: t.headerType,
          headerText: t.headerText ?? "",
          headerMediaUrl: t.headerMediaUrl ?? "",
          body: t.body,
          footer: t.footer ?? "",
          buttons: t.buttons as TemplateButton[],
          variables: t.variables as VarMap,
          codeExpiryMins: t.codeExpiryMins,
          securityNote: t.securityNote,
        }}
      />
    </>
  );
}
