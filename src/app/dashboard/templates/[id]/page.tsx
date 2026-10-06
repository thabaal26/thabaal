import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader, StatusBadge } from "@/components/ui";
import { WhatsAppBubble } from "@/components/whatsapp-preview";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { getScope, owned } from "@/lib/session";
import { renderFor, SAMPLE_CUSTOMER, type TemplateButton, type VarMap } from "@/lib/template";
import { TemplateEditor } from "../template-editor";

export const metadata: Metadata = { title: "Edit template" };
export const dynamic = "force-dynamic";

export default async function EditTemplatePage({ params }: PageProps<"/dashboard/templates/[id]">) {
  const { id } = await params;
  const scope = await getScope();
  const t = await db.template.findFirst({ where: { id, ...owned(scope) }, include: { client: { select: { name: true } } } });
  if (!t) notFound();

  const back = (
    <Link href="/dashboard/templates" className="-my-2 mb-1 inline-flex items-center gap-1 py-2 text-sm text-muted hover:text-ink sm:mb-3 sm:text-xs">
      <ArrowLeft className="size-3.5" /> Templates
    </Link>
  );

  if (!scope.isAdmin) {
    const r = renderFor({ ...t, headerText: t.headerText ?? "", footer: t.footer ?? "", variables: t.variables as VarMap }, SAMPLE_CUSTOMER);
    return (
      <>
        {back}
        <PageHeader title={t.name} description={`${t.language} · last changed ${fmtDate(t.updatedAt)}`} actions={<StatusBadge status={t.status} />} />
        <Card className="chat-wall max-w-md p-5">
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
      {back}
      <PageHeader
        title={t.name}
        description={`${t.client.name} · last changed ${fmtDate(t.updatedAt)}${t.lastSyncedAt ? ` · synced with Meta ${fmtDate(t.lastSyncedAt)}` : ""}`}
      />
      <TemplateEditor
        id={t.id}
        status={t.status}
        statusReason={t.statusReason}
        businessName={t.client.name}
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
