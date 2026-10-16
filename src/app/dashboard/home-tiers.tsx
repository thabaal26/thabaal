import type { ReactNode } from "react";
import { Plus } from "@/components/icons";
import Link from "@/components/intent-link";
import { PageTools } from "@/components/shell-tools";
import { cn } from "@/lib/cn";
import { AiBusinessCopilot } from "./ai-copilot";

/*
 * Home: a short, live summary of today. Every figure comes from the client's own orders, chats and
 * messages; when there is nothing, it says so (zero, "nothing scheduled"), never sample numbers.
 * The full analysis (customers, products, carts, message-to-sale) lives on Reports.
 */

export type HomeKpi = {
  label: string;
  /** Formatted value, e.g. "₹1,713" or "68%". */
  value: string;
  cur: number;
  prev: number;
  /** "pct": change in percent; "pts": change in percentage points (for rates). */
  kind: "pct" | "pts";
  spark: number[];
  href?: string;
};

export type HomeCampaignRow = { id: string; name: string; when: string; status: "Scheduled" | "Sending" | "Template not approved" };

export type HomeTiersProps = {
  greetingText: string;
  ordersOn: boolean;
  repliesOn: boolean;
  campaignsOn: boolean;
  unpaidCartsCount: number;
  unpaidCartsValue: number;
  toPackCount: number;
  /** How the orders to pack are paid: marked paid, cash on delivery, or confirmed with payment still to come. */
  toPackSplit?: { paid: number; cod: number; other: number };
  /** Messages sent and customer replies received since midnight. */
  today?: { sent: number; replies: number };
  unhandledRepliesCount: number;
  /** When the longest-waiting unanswered chat first wrote (null when none). */
  oldestWaitingAt: Date | null;
  activeRange: string;
  kpis: HomeKpi[];
  /** The WhatsApp costs card; streams in on its own (it may call Meta). */
  wallet: ReactNode;
  campaigns: HomeCampaignRow[];
  /** Reorder reminder setting: days after an order, or null when it's off. Undefined hides the row. */
  reminderDays?: number | null;
  refillsDueCount: number;
  brief: string;
  briefActions: { label: string; href: string }[];
  /** Extra buttons beside "New order" (admins: run the scheduler, new campaign). */
  actions?: ReactNode;
  /** Warnings that need someone (paused campaigns, failures, payments to check), under the greeting. */
  alerts?: ReactNode;
};

const card = "rounded-card border-[1.5px] border-line bg-panel shadow-card";
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Small area chart of a KPI over the period. Flat when there's nothing yet. */
function AreaSparkline({ data, tone }: { data: number[]; tone: "brand" | "danger" }) {
  const width = 120;
  const height = 36;
  const pad = 3;
  const series = data.length >= 2 ? data : [0, 0];
  const min = Math.min(...series);
  const max = Math.max(...series);
  const range = max - min || 1;
  const pts = series.map((v, i) => [(i / (series.length - 1)) * width, max === min ? height - pad : height - pad - ((v - min) / range) * (height - pad * 2)]);
  const d = "M" + pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("L");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn("block h-9 w-full", tone === "danger" ? "text-danger-solid" : "text-brand")} preserveAspectRatio="none" aria-hidden>
      <path d={`${d}L${width} ${height}L0 ${height}Z`} fill="currentColor" fillOpacity="0.2" />
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** The real change against the period before. */
function delta(k: HomeKpi): { text: string; tone: "up" | "down" | "flat" } {
  if (k.kind === "pts") {
    if (!k.prev && !k.cur) return { text: "—", tone: "flat" };
    const d = Math.round(k.cur - k.prev);
    return d === 0 ? { text: "No change", tone: "flat" } : { text: `${d > 0 ? "+" : ""}${d} pts`, tone: d > 0 ? "up" : "down" };
  }
  if (!k.prev) return k.cur ? { text: "New", tone: "up" } : { text: "—", tone: "flat" };
  const d = Math.round(((k.cur - k.prev) / k.prev) * 100);
  return d === 0 ? { text: "No change", tone: "flat" } : { text: `${d > 0 ? "+" : ""}${d}%`, tone: d > 0 ? "up" : "down" };
}

function waitText(since: Date | null) {
  if (!since) return "No one waiting";
  const mins = Math.max(1, Math.round((Date.now() - since.getTime()) / 60000));
  if (mins < 60) return `Longest wait ${mins} min`;
  const h = Math.round(mins / 60);
  return h < 48 ? `Longest wait ${h} h` : `Longest wait ${Math.round(h / 24)} days`;
}

/** "2 paid · 1 COD" from the real orders; "Paid or COD" when there's nothing to pack. */
function packText(s: HomeTiersProps["toPackSplit"]) {
  if (!s) return "Paid or COD";
  const parts = [s.paid && `${s.paid} paid`, s.cod && `${s.cod} COD`, s.other && `${s.other} confirmed`].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Paid or COD";
}

function TodoTile({ href, big, title, sub, go }: { href: string; big: string; title: string; sub: string; go: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-xl border-[1.5px] border-line bg-panel p-3.5 transition hover:border-ink active:scale-[0.99] sm:gap-4 sm:p-4">
      <span className="tabular shrink-0 font-display text-[22px] font-semibold leading-none text-ink sm:text-[26px]">{big}</span>
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[13.5px] font-bold text-ink sm:text-[14.5px]">{title}</b>
        <span className="block truncate text-[12px] text-muted sm:text-[13px]">{sub}</span>
      </span>
      <span className="ml-auto shrink-0 whitespace-nowrap text-[13px] font-bold text-ink dark:text-brand sm:text-[14px]">{go} ›</span>
    </Link>
  );
}

const RANGES = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
];

const pill = {
  Scheduled: "bg-info-bg text-info",
  Sending: "bg-success-bg text-success",
  "Template not approved": "bg-warning-bg text-warning",
  On: "bg-success-bg text-success",
  Off: "bg-neutral-bg text-neutral",
} as const;

export function HomeTiers(p: HomeTiersProps) {
  const todos = [
    p.ordersOn && { key: "carts", n: p.unpaidCartsCount, node: <TodoTile key="carts" href="/dashboard/orders?show=unpaid" big={inr(p.unpaidCartsValue)} title="Unpaid carts" sub={`${p.unpaidCartsCount} customer${p.unpaidCartsCount === 1 ? "" : "s"}`} go="Chase" /> },
    p.ordersOn && { key: "pack", n: p.toPackCount, node: <TodoTile key="pack" href="/dashboard/orders/packing" big={String(p.toPackCount)} title="Orders to pack" sub={packText(p.toPackSplit)} go="Pack" /> },
    p.repliesOn && { key: "chats", n: p.unhandledRepliesCount, node: <TodoTile key="chats" href="/dashboard/replies" big={String(p.unhandledRepliesCount)} title="Chats waiting" sub={waitText(p.oldestWaitingAt)} go="Reply" /> },
  ].filter((t): t is { key: string; n: number; node: React.JSX.Element } => Boolean(t));
  const needing = todos.filter((t) => t.n > 0).length;
  const rangeWord = RANGES.find((r) => r.id === p.activeRange)?.label ?? "7 days";

  return (
    <div className="mx-auto max-w-5xl space-y-5 sm:space-y-7">
      <header className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-[-0.3px] text-ink sm:text-[32px]">{p.greetingText}</h1>
          <p className="mt-0.5 text-[13px] text-muted sm:mt-1 sm:text-[14.5px]">Here is today, in plain words.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {p.actions}
          {p.ordersOn && (
            <Link href="/dashboard/orders?new=1" className="inline-flex min-h-[38px] items-center gap-2 rounded-control bg-brand px-3.5 text-[13.5px] font-semibold text-on-brand shadow-xs transition hover:brightness-105 active:scale-[0.98] sm:min-h-[40px] sm:px-4 sm:text-[14px]">
              <Plus aria-hidden className="size-4" />
              New order
            </Link>
          )}
          <PageTools />
        </div>
      </header>

      {p.alerts && <div className="space-y-3 [&>*]:mb-0 [&>div]:space-y-3 empty:hidden">{p.alerts}</div>}

      {todos.length > 0 && (
        <section className={cn(card, "p-4 sm:p-6")}>
          <div className="mb-3.5 sm:mb-4">
            <h2 className="font-display text-[18px] font-semibold text-ink sm:text-[20px]">
              {needing === 0 ? "Nothing needs you right now" : `${needing} thing${needing === 1 ? "" : "s"} need${needing === 1 ? "s" : ""} you today`}
            </h2>
            <p className="mt-0.5 text-[12.5px] text-muted sm:text-[13.5px]">{needing === 0 ? "All caught up. New orders and chats will show here." : "Start here. Everything else can wait."}</p>
          </div>
          <div className={cn("grid grid-cols-1 gap-2.5 sm:gap-4", todos.length === 3 ? "md:grid-cols-3" : todos.length === 2 ? "md:grid-cols-2" : "")}>{todos.map((t) => t.node)}</div>
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
          <h2 className="font-display text-[18px] font-semibold text-ink sm:text-[20px]">How the business is doing</h2>
          <nav aria-label="Period" className="inline-flex rounded-full border-[1.5px] border-line bg-panel p-[2.5px] sm:p-[3px]">
            {RANGES.map((r) => {
              const active = p.activeRange === r.id;
              return (
                <Link
                  key={r.id}
                  href={r.id === "7d" ? "/dashboard" : `/dashboard?range=${r.id}`}
                  aria-current={active ? "page" : undefined}
                  className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition sm:px-3.5 sm:py-1 sm:text-xs", active ? "bg-ink text-canvas" : "text-muted hover:text-ink")}
                >
                  {r.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
          {p.kpis.map((k) => {
            const dl = delta(k);
            const body = (
              <>
                <div className="px-3 pt-3 sm:px-5 sm:pt-5">
                  <div className="truncate text-[11.5px] font-medium text-muted sm:text-[13.5px]">{k.label}</div>
                  <div className="tabular mt-0.5 font-display text-[20px] font-semibold leading-tight text-ink sm:mt-1 sm:text-[28px] truncate">{k.value}</div>
                  <div className={cn("tabular mt-0.5 text-[11.5px] font-semibold sm:mt-1 sm:text-[13px] truncate", dl.tone === "up" ? "text-success" : dl.tone === "down" ? "text-danger" : "text-muted")}>{dl.text}</div>
                </div>
                <div className="mt-2 overflow-hidden rounded-b-[inherit] sm:mt-3">
                  <AreaSparkline data={k.spark} tone={dl.tone === "down" ? "danger" : "brand"} />
                </div>
              </>
            );
            return k.href ? (
              <Link key={k.label} href={k.href} className={cn(card, "flex flex-col justify-between transition hover:border-ink")}>
                {body}
              </Link>
            ) : (
              <div key={k.label} className={cn(card, "flex flex-col justify-between")}>
                {body}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[12px] text-muted sm:mt-2.5 sm:text-[12.5px]">
          Compared with the previous {rangeWord}. <Link href="/dashboard/report" className="font-semibold text-ink underline-offset-4 hover:underline">Full reports ›</Link>
        </p>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {p.wallet}
        {p.campaignsOn && (
          <section className={cn(card, "flex flex-col justify-between p-5")}>
            <div>
              <div className="mb-3.5 flex items-center justify-between gap-2">
                <h2 className="font-display text-[19px] font-semibold text-ink">Next campaign</h2>
                <Link href="/dashboard/campaigns" className="inline-flex min-h-[32px] items-center justify-center rounded-[10px] border-[1.5px] border-line px-3 text-[13.5px] font-semibold text-muted transition hover:text-ink">
                  All campaigns
                </Link>
              </div>
              <ul className="divide-y divide-line">
                {p.campaigns.length === 0 && <li className="py-2.5 text-[13.5px] text-muted">Nothing scheduled.</li>}
                {p.campaigns.map((c) => (
                  <li key={c.id} className="relative flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <Link href={`/dashboard/campaigns/${c.id}`} className="block truncate text-[14.5px] font-semibold text-ink after:absolute after:inset-0">
                        {c.name}
                      </Link>
                      <div className="text-[13px] text-muted">{c.when}</div>
                    </div>
                    <span className={cn("inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[12px] font-bold", pill[c.status])}>{c.status}</span>
                  </li>
                ))}
                {p.reminderDays !== undefined && (
                  <li className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-[14.5px] font-semibold text-ink">Reorder reminder</div>
                      <div className="text-[13px] text-muted">
                        {p.reminderDays ? `${p.reminderDays} days after an order · Automatic` : "Off"}
                        {p.refillsDueCount > 0 ? ` · ${p.refillsDueCount} due this week` : ""}
                      </div>
                    </div>
                    <span className={cn("inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[12px] font-bold", p.reminderDays ? pill.On : pill.Off)}>{p.reminderDays ? "On" : "Off"}</span>
                  </li>
                )}
                {p.today && (
                  <li className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-[14.5px] font-semibold text-ink">Today so far</div>
                      <div className="tabular text-[13px] text-muted">
                        {p.today.sent.toLocaleString("en-IN")} message{p.today.sent === 1 ? "" : "s"} sent · {p.today.replies.toLocaleString("en-IN")} repl{p.today.replies === 1 ? "y" : "ies"}
                      </div>
                    </div>
                  </li>
                )}
              </ul>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <Link href="/dashboard/campaigns/new" className="inline-flex min-h-[34px] items-center justify-center rounded-xl bg-brand px-3.5 text-[13.5px] font-semibold text-on-brand transition hover:brightness-105">
                + Create campaign
              </Link>
              {p.reminderDays !== undefined && (
                <Link href="/dashboard/campaigns#reorder-settings" className="inline-flex min-h-[34px] items-center justify-center rounded-xl border-[1.5px] border-line px-3.5 text-[13.5px] font-semibold text-ink transition hover:border-ink">
                  Reorder settings
                </Link>
              )}
            </div>
          </section>
        )}
      </div>

      <AiBusinessCopilot initialBrief={p.brief} initialActions={p.briefActions} />
    </div>
  );
}
