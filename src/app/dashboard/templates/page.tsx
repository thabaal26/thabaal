import { Plus, RefreshCw, Search } from "@/components/icons";
import type { Metadata } from "next";
import Link from "@/components/intent-link";
import { WhatsAppBubble } from "@/components/whatsapp-preview";
import { DefaultImage } from "./default-image";
import { db } from "@/lib/db";
import { fmtNumber } from "@/lib/format";
import { templateLabel } from "@/lib/plain-error";
import { getScope, owned } from "@/lib/session";
import { CATEGORY_INFO, renderFor, SAMPLE_CUSTOMER, type Category, type TemplateButton, type VarMap } from "@/lib/template";
import { deleteTemplate, syncTemplates } from "../actions/templates";

import { AutoSelect, PAction, PortalPage } from "../portal-ui";

export const metadata: Metadata = { title: "Templates" };
export const dynamic = "force-dynamic";

export default async function TemplatesPage({ searchParams }: PageProps<"/dashboard/templates">) {
  const sp = await searchParams;
  const { category, q } = sp;
  const sort = typeof sp.sort === "string" ? sp.sort : "latest";
  const st = typeof sp.st === "string" ? sp.st : "";
  const lg = typeof sp.lg === "string" ? sp.lg : "";
  const fm = typeof sp.fm === "string" ? sp.fm : "";
  const active = (Object.keys(CATEGORY_INFO) as Category[]).find((c) => c === category);
  const query = typeof q === "string" ? q.trim() : "";
  const scope = await getScope();
  const canCreate = scope.canManage && scope.clientId;

  const qFilter = query
    ? {
        OR: [
          { name: { contains: query, mode: "insensitive" as const } },
          { body: { contains: query, mode: "insensitive" as const } },
          { language: { contains: query, mode: "insensitive" as const } },
        ],
      }
    : {};

  const stFilter =
    st === "approved" ? { status: "APPROVED" as const } : st === "review" ? { status: "PENDING" as const } : st === "rejected" ? { status: { in: ["REJECTED", "PAUSED", "DISABLED"] as ("REJECTED" | "PAUSED" | "DISABLED")[] } } : st === "draft" ? { status: "DRAFT" as const } : {};
  const lgFilter = lg ? { language: { startsWith: lg } } : {};
  const fmFilter = fm === "image" ? { headerType: "IMAGE" as const } : {};

  const orderBy =
    sort === "name"
      ? [{ name: "asc" as const }]
      : sort === "updated"
      ? [{ updatedAt: "desc" as const }, { createdAt: "desc" as const }]
      : [{ createdAt: "desc" as const }, { id: "desc" as const }];

  const [templatesAll, counts, statusCounts, brand] = await Promise.all([
    db.template.findMany({
      where: { ...owned(scope), ...(active ? { category: active } : {}), ...qFilter, ...stFilter, ...lgFilter, ...fmFilter },
      include: { _count: { select: { campaigns: true } }, client: { select: { name: true, defaultImageUrl: true, bannerUrl: true } } },
      orderBy,
    }),
    db.template.groupBy({ by: ["category"], where: owned(scope), _count: true }),
    // For the totals: every template's status, whatever the filters.
    db.template.groupBy({ by: ["status"], where: owned(scope), _count: true }),
    scope.clientId ? db.client.findUnique({ where: { id: scope.clientId }, select: { defaultImageUrl: true, bannerUrl: true } }) : null,
  ]);
  // Format "Text" / "Interactive" depends on the buttons, so it's applied here.
  const hasButtons = (t: { buttons: unknown }) => Array.isArray(t.buttons) && t.buttons.length > 0;
  const templates = fm === "interactive" ? templatesAll.filter(hasButtons) : fm === "text" ? templatesAll.filter((t) => t.headerType === "NONE" || t.headerType === "TEXT").filter((t) => !hasButtons(t)) : templatesAll;
  const total = counts.reduce((a, c) => a + c._count, 0);
  const byStatus = (...xs: string[]) => statusCounts.filter((c) => xs.includes(c.status)).reduce((n, c) => n + c._count, 0);
  // What an image template without its own picture will send.
  const fallbackFor = (c: { defaultImageUrl: string | null; bannerUrl: string | null }) => c.defaultImageUrl ?? c.bannerUrl;


  const qsFor = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(
      Object.entries({ category: active, q: query || undefined, sort: sort !== "latest" ? sort : undefined, st: st || undefined, lg: lg || undefined, fm: fm || undefined, ...patch }).filter(([, v]) => v) as [string, string][],
    );
    return `/dashboard/templates${next.size ? `?${next}` : ""}`;
  };
  const statusPill = (s: string) =>
    s === "APPROVED" ? { tone: "ok", label: "Approved" } : s === "PENDING" ? { tone: "warn", label: "In review" } : s === "DRAFT" ? { tone: "mute", label: "Draft" } : { tone: "bad", label: s === "PAUSED" ? "Paused by Meta" : s === "DISABLED" ? "Disabled by Meta" : "Rejected" };
  const kindTone = { MARKETING: "warn", UTILITY: "info", AUTHENTICATION: "mute" } as const;
  const formatOf = (t: (typeof templates)[number]) => (t.headerType === "IMAGE" ? "Image" : hasButtons(t) ? "Interactive" : "Text");

  return (
    <PortalPage title="Templates" titleTa="டெம்ப்ளேட்" sub="Meta-approved messages you can send. Marketing, Utility and Authentication." subTa="நீங்கள் அனுப்பக்கூடிய மெட்டா அங்கீகரித்த செய்திகள்.">
      <div className="grid g4 keep2" style={{ marginBottom: 16 }}>
        <div className="card stat">
          <div className="l">Templates</div>
          <div className="v">{fmtNumber(total)}</div>
        </div>
        <div className="card stat">
          <div className="l">Approved</div>
          <div className="v">{fmtNumber(byStatus("APPROVED"))}</div>
          <div className="d muted">Ready to send</div>
        </div>
        <div className="card stat">
          <div className="l">Waiting on Meta</div>
          <div className="v">{fmtNumber(byStatus("PENDING"))}</div>
          <div className="d muted">{byStatus("DRAFT") ? `${byStatus("DRAFT")} draft${byStatus("DRAFT") === 1 ? "" : "s"} too` : ""}</div>
        </div>
        <div className="card stat">
          <div className="l">Need fixing</div>
          <div className="v">{fmtNumber(byStatus("REJECTED", "PAUSED", "DISABLED"))}</div>
          <div className="d muted">Rejected or paused by Meta</div>
        </div>
      </div>

      <p className="muted" style={{ marginBottom: 12 }}>
        WhatsApp only lets you send messages built from approved templates. The kind you choose decides the price: <b>Marketing</b> costs the most, <b>Utility</b> costs less, <b>Authentication</b> is for
        one-time codes.
      </p>

      <div className="chips" style={{ marginBottom: 12, alignItems: "center" }}>
        {[{ key: "", label: "All", n: total }, ...(Object.keys(CATEGORY_INFO) as Category[]).map((c) => ({ key: c, label: CATEGORY_INFO[c].label, n: counts.find((x) => x.category === c)?._count ?? 0 }))].map((tab) => (
          <Link key={tab.key} className="chip" href={qsFor({ category: tab.key || undefined })} aria-pressed={(active ?? "") === tab.key} scroll={false}>
            {tab.label} <small>{tab.n}</small>
          </Link>
        ))}
        {active && <span className="muted small" style={{ marginLeft: 8 }}>{CATEGORY_INFO[active].hint}</span>}
      </div>

      <form className="toolbar" role="search">
        {active && <input type="hidden" name="category" value={active} />}
        <div className="search">
          <Search aria-hidden />
          <input type="search" name="q" defaultValue={query} placeholder="Search template name or words inside" aria-label="Search templates" />
        </div>
        <AutoSelect name="st" label="Status" value={st} options={[{ value: "", label: "Status: all" }, { value: "approved", label: "Approved" }, { value: "review", label: "In review" }, { value: "rejected", label: "Rejected or paused" }, { value: "draft", label: "Draft" }]} />
        <AutoSelect name="lg" label="Language" value={lg} options={[{ value: "", label: "Language: all" }, { value: "en", label: "English" }, { value: "ta", label: "Tamil" }, { value: "hi", label: "Hindi" }]} />
        <AutoSelect name="fm" label="Format" value={fm} options={[{ value: "", label: "Format: all" }, { value: "text", label: "Text" }, { value: "image", label: "Image or media" }, { value: "interactive", label: "Interactive (buttons)" }]} />
        <AutoSelect name="sort" label="Sort" value={sort} options={[{ value: "latest", label: "Newest first" }, { value: "updated", label: "Recently changed" }, { value: "name", label: "Name A–Z" }]} />
        {canCreate && (
          <div className="tools" style={{ marginLeft: "auto" }}>
            <PAction action={syncTemplates} title="Fetch the latest templates and statuses from Meta">
              <RefreshCw aria-hidden className="ic" style={{ width: 15, height: 15 }} /> Sync with Meta
            </PAction>
            <Link className="btn primary sm" href="/dashboard/templates/new">
              <Plus aria-hidden className="ic" style={{ width: 15, height: 15 }} /> New template
            </Link>
          </div>
        )}
      </form>

      {scope.canManage && brand && (
        <div style={{ marginBottom: 16 }}>
          <DefaultImage url={brand.defaultImageUrl} fallback={brand.bannerUrl} />
        </div>
      )}

      {templates.length ? (
        <div className="grid g3">
          {templates.map((t) => {
            const r = renderFor({ ...t, headerText: t.headerText ?? "", footer: t.footer ?? "", variables: t.variables as VarMap }, SAMPLE_CUSTOMER);
            const sp2 = statusPill(t.status);
            const broken = ["REJECTED", "PAUSED", "DISABLED"].includes(t.status);
            return (
              <div key={t.id} className="card" style={{ display: "flex", flexDirection: "column" }}>
                <div className="hd" style={{ marginBottom: 10, flexWrap: "nowrap" }}>
                  <Link href={`/dashboard/templates/${t.id}`} title={t.name} style={{ fontWeight: 700, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {templateLabel(t.name)}
                  </Link>
                  <span className={`pill ${sp2.tone}`}>{sp2.label}</span>
                </div>
                <div className="phone" style={{ maxHeight: 240, overflow: "hidden" }}>
                  <WhatsAppBubble
                    header={r.header}
                    headerImage={t.headerType === "IMAGE" ? t.headerMediaUrl || fallbackFor(t.client) : undefined}
                    body={r.body}
                    footer={r.footer}
                    buttons={t.buttons as TemplateButton[]}
                    className="pointer-events-none max-w-[17rem]"
                  />
                </div>
                <p className="muted small" style={{ marginTop: 10 }}>
                  <span className={`pill ${kindTone[t.category as Category]}`}>{CATEGORY_INFO[t.category as Category].label}</span> {!scope.clientId && `${t.client.name} · `}
                  {t.language} · {formatOf(t)} · {t._count.campaigns ? `used in ${t._count.campaigns} campaign${t._count.campaigns > 1 ? "s" : ""}` : "not in a campaign yet"}
                  {t.qualityScore && t.qualityScore !== "UNKNOWN" && ` · quality ${t.qualityScore.toLowerCase()}`}
                </p>
                {broken && t.statusReason && (
                  <p className="small down" style={{ marginTop: 8 }}>
                    <b>{t.statusReason}</b>
                  </p>
                )}
                {t.headerType === "IMAGE" && !t.headerMediaUrl && !fallbackFor(t.client) && (
                  <p className="note small" style={{ marginTop: 8 }}>
                    Image missing: sends will fail until you add one, or set a default image above.
                  </p>
                )}
                <div className="tools" style={{ marginTop: "auto", paddingTop: 10 }}>
                  <Link className="btn sm" href={`/dashboard/templates/${t.id}`}>
                    {scope.canManage ? (broken ? "Fix and resend" : "Edit") : "Preview"}
                  </Link>
                  {t.category === "MARKETING" && t.status === "APPROVED" && canCreate && (
                    <Link className="btn sm primary" href="/dashboard/campaigns/new">
                      Use in campaign
                    </Link>
                  )}
                  {scope.canManage && (
                    <PAction action={deleteTemplate.bind(null, t.id)} className="sm ghost" confirm={`Delete "${t.name}"? This also deletes it from Meta.`} aria-label={`Delete ${t.name}`}>
                      Delete
                    </PAction>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <section className="card">
          <h2>{query ? `No templates matching “${query}”` : "No templates match"}</h2>
          <p className="muted" style={{ marginTop: 6 }}>
            {query || st || lg || fm || active
              ? "Try another filter."
              : canCreate
                ? "Create one here, or sync the templates you already made in WhatsApp Manager."
                : "Message templates approved for your WhatsApp number will appear here."}
          </p>
        </section>
      )}
    </PortalPage>
  );
}
