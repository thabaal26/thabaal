import { Plus, RefreshCw, SquarePen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { buttonClass, Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { WhatsAppBubble } from "@/components/whatsapp-preview";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { getScope, owned } from "@/lib/session";
import { CATEGORY_INFO, renderFor, SAMPLE_CUSTOMER, type Category, type TemplateButton, type VarMap } from "@/lib/template";
import { deleteTemplate, syncTemplates } from "../actions/templates";

export const metadata: Metadata = { title: "Templates" };
export const dynamic = "force-dynamic";

export default async function TemplatesPage({ searchParams }: PageProps<"/dashboard/templates">) {
  const { category } = await searchParams;
  const active = (Object.keys(CATEGORY_INFO) as Category[]).find((c) => c === category);
  const scope = await getScope();
  const canCreate = scope.isAdmin && scope.clientId;
  const [templates, counts] = await Promise.all([
    db.template.findMany({
      where: { ...owned(scope), ...(active ? { category: active } : {}) },
      include: { _count: { select: { campaigns: true } }, client: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    db.template.groupBy({ by: ["category"], where: owned(scope), _count: true }),
  ]);
  const total = counts.reduce((a, c) => a + c._count, 0);

  return (
    <>
      <PageHeader
        title="Templates"
        description="Messages Meta has approved for your number. Edit one here and every future send uses the new version once Meta approves it."
        actions={
          canCreate && <>
            <ActionButton action={syncTemplates} size="md" title="Fetch the latest templates and statuses from Meta">
              <RefreshCw className="size-4" /> Sync with Meta
            </ActionButton>
            <Link href="/dashboard/templates/new" className={buttonClass("primary")}>
              <Plus className="size-4" /> New template
            </Link>
          </>
        }
      />

      <div className="no-scrollbar -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {[{ key: "", label: "All", n: total }, ...(Object.keys(CATEGORY_INFO) as Category[]).map((c) => ({ key: c, label: CATEGORY_INFO[c].label, n: counts.find((x) => x.category === c)?._count ?? 0 }))].map((tab) => (
          <Link
            key={tab.key}
            href={tab.key ? `/dashboard/templates?category=${tab.key}` : "/dashboard/templates"}
            className={cn(
              "flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium transition active:scale-95 sm:h-auto sm:px-3 sm:py-1.5 sm:text-xs",
              (active ?? "") === tab.key ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-2 hover:border-ink/30",
            )}
          >
            {tab.label} <span className="tabular opacity-60">{tab.n}</span>
          </Link>
        ))}
      </div>

      {templates.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => {
            const r = renderFor({ ...t, headerText: t.headerText ?? "", footer: t.footer ?? "", variables: t.variables as VarMap }, SAMPLE_CUSTOMER);
            return (
              <Card key={t.id} className="flex flex-col overflow-hidden transition hover:shadow-pop">
                <Link href={`/dashboard/templates/${t.id}`} className="chat-wall block h-56 overflow-hidden p-4">
                  <WhatsAppBubble
                    header={r.header}
                    headerImage={t.headerType === "IMAGE" ? t.headerMediaUrl : undefined}
                    body={r.body}
                    footer={r.footer}
                    buttons={t.buttons as TemplateButton[]}
                    className="pointer-events-none origin-top-left scale-[0.9]"
                  />
                </Link>
                <div className="flex flex-1 flex-col gap-3 border-t border-line p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/dashboard/templates/${t.id}`} className="block truncate font-mono text-sm font-medium hover:underline">{t.name}</Link>
                      <p className="mt-0.5 text-xs text-muted">{!scope.clientId && `${t.client.name} · `}{t.language} · updated {fmtDate(t.updatedAt, "d MMM")}{t._count.campaigns ? ` · ${t._count.campaigns} campaign${t._count.campaigns > 1 ? "s" : ""}` : ""}</p>
                    </div>
                    <StatusBadge status={t.status} />
                  </div>
                  <div className="mt-auto flex items-center justify-between">
                    <StatusBadge status={t.category} />
                    <div className="flex gap-1">
                      <Link href={`/dashboard/templates/${t.id}`} className={buttonClass("secondary", "sm")}>{scope.isAdmin ? "Edit" : "View"}</Link>
                      {scope.isAdmin && (
                        <ActionButton action={deleteTemplate.bind(null, t.id)} variant="ghost" confirm={`Delete "${t.name}"? This also deletes it from Meta.`}>Delete</ActionButton>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={<SquarePen className="size-5" />}
            title={active ? `No ${CATEGORY_INFO[active].label.toLowerCase()} templates` : "No templates yet"}
            action={canCreate && <Link href="/dashboard/templates/new" className={buttonClass("primary")}><Plus className="size-4" /> New template</Link>}
          >
            {canCreate
              ? "Create one here, or sync the templates you already made in WhatsApp Manager."
              : scope.isAdmin
                ? "Pick a client in the sidebar to add or sync their templates."
                : "Message templates approved for your WhatsApp number will appear here."}
          </EmptyState>
        </Card>
      )}
    </>
  );
}
