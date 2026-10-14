import { CheckCircle2, Clock, FileText, Megaphone, Plus, RefreshCw } from "@/components/icons";
import type { Metadata } from "next";
import Link from "@/components/intent-link";
import { ActionButton } from "@/components/action-button";
import { Badge, buttonClass, Card, EmptyState, FilterChips, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { WhatsAppBubble } from "@/components/whatsapp-preview";
import { DefaultImage } from "./default-image";
import { db } from "@/lib/db";
import { fmtDate, fmtNumber } from "@/lib/format";
import { getScope, owned } from "@/lib/session";
import { CATEGORY_INFO, renderFor, SAMPLE_CUSTOMER, type Category, type TemplateButton, type VarMap } from "@/lib/template";
import { deleteTemplate, syncTemplates } from "../actions/templates";

export const metadata: Metadata = { title: "Templates" };
export const dynamic = "force-dynamic";

export default async function TemplatesPage({ searchParams }: PageProps<"/dashboard/templates">) {
  const { category } = await searchParams;
  const active = (Object.keys(CATEGORY_INFO) as Category[]).find((c) => c === category);
  const scope = await getScope();
  const canCreate = scope.canManage && scope.clientId;
  const [templates, counts, brand] = await Promise.all([
    db.template.findMany({
      where: { ...owned(scope), ...(active ? { category: active } : {}) },
      include: { _count: { select: { campaigns: true } }, client: { select: { name: true, defaultImageUrl: true, bannerUrl: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    db.template.groupBy({ by: ["category"], where: owned(scope), _count: true }),
    scope.clientId ? db.client.findUnique({ where: { id: scope.clientId }, select: { defaultImageUrl: true, bannerUrl: true } }) : null,
  ]);
  const total = counts.reduce((a, c) => a + c._count, 0);
  const approvedCount = templates.filter((t) => t.status === "APPROVED").length;
  const pendingCount = templates.filter((t) => t.status === "PENDING" || t.status === "DRAFT").length;
  const marketingCount = counts.find((c) => c.category === "MARKETING")?._count ?? 0;
  // What an image template without its own picture will send.
  const fallbackFor = (c: { defaultImageUrl: string | null; bannerUrl: string | null }) => c.defaultImageUrl ?? c.bannerUrl;

  return (
    <>
      <PageHeader
        title="Templates"
        description="Messages Meta has approved for your number. Edit one here and every future send uses the new version once Meta approves it."
        actions={
          canCreate && <>
            <ActionButton action={syncTemplates} size="md" title="Fetch the latest templates and statuses from Meta">
              <RefreshCw aria-hidden className="size-4" /> Sync with Meta
            </ActionButton>
            <Link href="/dashboard/templates/new" className={buttonClass("primary")}>
              <Plus aria-hidden className="size-4" /> New template
            </Link>
          </>
        }
        tabs={
          <FilterChips
            label="Template category"
            items={[{ key: "", label: "All", n: total }, ...(Object.keys(CATEGORY_INFO) as Category[]).map((c) => ({ key: c, label: CATEGORY_INFO[c].label, n: counts.find((x) => x.category === c)?._count ?? 0 }))].map((tab) => ({
              href: tab.key ? `/dashboard/templates?category=${tab.key}` : "/dashboard/templates",
              label: tab.label,
              count: tab.n,
              active: (active ?? "") === tab.key,
            }))}
          />
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Total templates" value={fmtNumber(total)} sub="Synced with Meta" icon={<FileText />} tone="info" href="/dashboard/templates" />
        <Stat
          label="Approved"
          value={fmtNumber(approvedCount)}
          sub="Ready to send"
          icon={<CheckCircle2 />}
          tone="brand"
          meter={templates.length > 0 ? Math.round((approvedCount / templates.length) * 100) : 0}
        />
        <Stat label="Marketing" value={fmtNumber(marketingCount)} sub="Promotions & offers" icon={<Megaphone />} tone="violet" href="/dashboard/templates?category=MARKETING" />
        <Stat label="In review / Draft" value={fmtNumber(pendingCount)} sub="Waiting on Meta" icon={<Clock />} tone="amber" />
      </div>

      {scope.canManage && brand && (
        <div className="mb-4">
          <DefaultImage url={brand.defaultImageUrl} fallback={brand.bannerUrl} />
        </div>
      )}

      {templates.length ? (
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
          {templates.map((t) => {
            const r = renderFor({ ...t, headerText: t.headerText ?? "", footer: t.footer ?? "", variables: t.variables as VarMap }, SAMPLE_CUSTOMER);
            return (
              <Card key={t.id} className="flex flex-col overflow-hidden rounded-[18px] border-[1.5px] border-line bg-panel shadow-[0_1px_0_rgba(16,40,59,.04),0_14px_30px_-22px_rgba(16,40,59,.35)] dark:shadow-[0_14px_30px_-22px_rgba(0,0,0,.7)] transition hover:border-ink">
                <div className="flex items-center justify-between bg-wa-bar px-3.5 py-2 text-2xs font-medium text-white/90">
                  <span className="truncate font-semibold">{t.client.name}</span>
                  <span className="font-mono text-white/70">{t.language}</span>
                </div>
                <Link
                  href={`/dashboard/templates/${t.id}`}
                  tabIndex={-1}
                  aria-hidden
                  className="chat-wall relative block max-h-56 min-h-28 overflow-hidden p-4 [mask-image:linear-gradient(to_bottom,black_80%,transparent)]"
                >
                  <WhatsAppBubble
                    header={r.header}
                    headerImage={t.headerType === "IMAGE" ? t.headerMediaUrl || fallbackFor(t.client) : undefined}
                    body={r.body}
                    footer={r.footer}
                    buttons={t.buttons as TemplateButton[]}
                    className="pointer-events-none max-w-[17rem]"
                  />
                </Link>
                <div className="flex flex-1 flex-col gap-3 border-t border-line p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/dashboard/templates/${t.id}`} className="block truncate font-mono text-sm font-semibold text-ink hover:underline" title={t.name}>{t.name}</Link>
                      <p className="mt-0.5 text-xs text-muted">{!scope.clientId && `${t.client.name} · `}{t.language} · updated {fmtDate(t.updatedAt, "d MMM")}{t._count.campaigns ? ` · ${t._count.campaigns} campaign${t._count.campaigns > 1 ? "s" : ""}` : ""}</p>
                    </div>
                    <StatusBadge status={t.status} />
                  </div>
                  {t.headerType === "IMAGE" && !t.headerMediaUrl && !fallbackFor(t.client) && (
                    <Link href={`/dashboard/templates/${t.id}`} className="-mt-1 rounded-control border border-warning-border bg-warning-bg px-2.5 py-1.5 text-xs text-warning">
                      Image missing: sends will fail until you add one here or set a default image above. <span className="font-medium underline">Add image</span>
                    </Link>
                  )}
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-line/70 pt-3">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={t.category} />
                      {t.qualityScore && t.qualityScore !== "UNKNOWN" && (
                        <Badge tone={t.qualityScore === "GREEN" ? "green" : t.qualityScore === "RED" ? "red" : "amber"} dot>
                          Quality {t.qualityScore.toLowerCase()}
                        </Badge>
                      )}
                    </span>
                    <div className="flex gap-1">
                      <Link href={`/dashboard/templates/${t.id}`} className={buttonClass("secondary", "sm")} aria-label={`${scope.canManage ? "Edit" : "View"} ${t.name}`}>{scope.canManage ? "Edit" : "View"}</Link>
                      {scope.canManage && (
                        <ActionButton action={deleteTemplate.bind(null, t.id)} variant="ghost" confirm={`Delete "${t.name}"? This also deletes it from Meta.`} aria-label={`Delete ${t.name}`}>Delete</ActionButton>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="rounded-[18px] border-[1.5px] border-line bg-panel shadow-[0_1px_0_rgba(16,40,59,.04),0_14px_30px_-22px_rgba(16,40,59,.35)] dark:shadow-[0_14px_30px_-22px_rgba(0,0,0,.7)]">
          <EmptyState
            icon={<FileText className="size-5" />}
            title={active ? `No ${CATEGORY_INFO[active].label.toLowerCase()} templates` : "No templates yet"}
            action={canCreate && <Link href="/dashboard/templates/new" className={buttonClass("primary")}><Plus className="size-4" /> New template</Link>}
          >
            {canCreate
              ? "Create one here, or sync the templates you already made in WhatsApp Manager."
              : scope.canManage
                ? "Pick a client in the sidebar to add or sync their templates."
                : "Message templates approved for your WhatsApp number will appear here."}
          </EmptyState>
        </Card>
      )}
    </>
  );
}

