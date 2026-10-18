import type { ReactNode } from "react";
import { IndianRupee, MessageCircle, Plus, Repeat, ShoppingBag } from "@/components/icons";
import { Stat } from "@/components/ui";
import Link from "@/components/intent-link";
import { AiBusinessCopilot } from "./ai-copilot";
import { inr } from "./portal-format";
import { Pill, PortalPage, Seg, Spark, T } from "./portal-ui";

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
  /** The business being looked at ("Good evening, Thenan Oils"); empty in an admin's all-businesses view. */
  businessName?: string | null;
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

/** The real change against the period before. */
function delta(k: HomeKpi): { text: string; tone: "up" | "down" | "flat" } {
  if (k.kind === "pts") {
    if (!k.prev && !k.cur) return { text: "—", tone: "flat" };
    const d = Math.round(k.cur - k.prev);
    return d === 0 ? { text: "No change", tone: "flat" } : { text: `${d > 0 ? "+" : "−"}${Math.abs(d)} pts`, tone: d > 0 ? "up" : "down" };
  }
  if (!k.prev) return k.cur ? { text: "New", tone: "up" } : { text: "—", tone: "flat" };
  const d = Math.round(((k.cur - k.prev) / k.prev) * 100);
  return d === 0 ? { text: "0%", tone: "flat" } : { text: `${d > 0 ? "+" : "−"}${Math.abs(d)}%`, tone: d > 0 ? "up" : "down" };
}

function waitText(since: Date | null, ta = false) {
  if (!since) return ta ? "யாரும் காத்திருக்கவில்லை" : "No one waiting";
  const mins = Math.max(1, Math.round((Date.now() - since.getTime()) / 60000));
  if (mins < 60) return ta ? `அதிகபட்ச காத்திருப்பு ${mins} நிமிடம்` : `Longest wait ${mins} min`;
  const h = Math.round(mins / 60);
  return h < 48
    ? (ta ? `அதிகபட்ச காத்திருப்பு ${h} மணிநேரம்` : `Longest wait ${h} h`)
    : (ta ? `அதிகபட்ச காத்திருப்பு ${Math.round(h / 24)} நாட்கள்` : `Longest wait ${Math.round(h / 24)} days`);
}

/** "2 paid · 1 COD" from the real orders; "Paid or COD" when there's nothing to pack. */
function packText(s: HomeTiersProps["toPackSplit"], ta = false) {
  if (!s) return ta ? "செலுத்தப்பட்டது அல்லது COD" : "Paid or COD";
  if (ta) {
    const parts = [
      s.paid && `${s.paid} செலுத்தப்பட்டது`,
      s.cod && `${s.cod} COD`,
      s.other && `${s.other} உறுதியானது`,
    ].filter(Boolean);
    return parts.length ? parts.join(" · ") : "செலுத்தப்பட்டது அல்லது COD";
  }
  const parts = [s.paid && `${s.paid} paid`, s.cod && `${s.cod} COD`, s.other && `${s.other} confirmed`].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Paid or COD";
}

function TodoTile({ href, big, title, titleTa, sub, subTa, go, goTa }: { href: string; big: string; title: string; titleTa: string; sub: string; subTa?: string; go: string; goTa: string }) {
  return (
    <Link className="todo" href={href}>
      <span className="big">{big}</span>
      <span>
        <b><T ta={titleTa}>{title}</T></b>
        <br />
        <span className="muted small"><T ta={subTa}>{sub}</T></span>
      </span>
      <span className="go"><T ta={goTa}>{go}</T> ›</span>
    </Link>
  );
}

const GREETING_TA: Record<string, string> = { "Good morning": "காலை வணக்கம்", "Good afternoon": "மதிய வணக்கம்", "Good evening": "மாலை வணக்கம்" };

const RANGES = [
  { id: "7d", label: "7 days", ta: "7 நாட்கள்" },
  { id: "30d", label: "30 days", ta: "30 நாட்கள்" },
  { id: "90d", label: "90 days", ta: "90 நாட்கள்" },
];

const campaignTone = { Scheduled: "info", Sending: "ok", "Template not approved": "warn" } as const;

export function HomeTiers(p: HomeTiersProps) {
  const todos = [
    p.ordersOn && {
      key: "carts",
      n: p.unpaidCartsCount,
      node: (
        <TodoTile
          key="carts"
          href="/dashboard/orders?show=unpaid"
          big={inr(p.unpaidCartsValue)}
          title="Unpaid carts"
          titleTa="செலுத்தப்படாத கார்ட்டுகள்"
          sub={`${p.unpaidCartsCount} customer${p.unpaidCartsCount === 1 ? "" : "s"}`}
          subTa={`${p.unpaidCartsCount} வாடிக்கையாளர்${p.unpaidCartsCount === 1 ? "" : "கள்"}`}
          go="Chase"
          goTa="நினைவூட்டு"
        />
      ),
    },
    p.ordersOn && {
      key: "pack",
      n: p.toPackCount,
      node: (
        <TodoTile
          key="pack"
          href="/dashboard/orders?show=topack"
          big={String(p.toPackCount)}
          title="Orders to pack"
          titleTa="பேக் செய்ய வேண்டியவை"
          sub={packText(p.toPackSplit, false)}
          subTa={packText(p.toPackSplit, true)}
          go="Pack"
          goTa="பேக்"
        />
      ),
    },
    p.repliesOn && {
      key: "chats",
      n: p.unhandledRepliesCount,
      node: (
        <TodoTile
          key="chats"
          href="/dashboard/replies?show=open"
          big={String(p.unhandledRepliesCount)}
          title="Chats waiting"
          titleTa="காத்திருக்கும் உரையாடல்கள்"
          sub={waitText(p.oldestWaitingAt, false)}
          subTa={waitText(p.oldestWaitingAt, true)}
          go="Reply"
          goTa="பதில்"
        />
      ),
    },
  ].filter((t): t is { key: string; n: number; node: React.JSX.Element } => Boolean(t));
  const needing = todos.filter((t) => t.n > 0).length;
  const rangeWord = RANGES.find((r) => r.id === p.activeRange)?.label ?? "7 days";
  const rangeWordTa = RANGES.find((r) => r.id === p.activeRange)?.ta ?? "7 நாட்கள்";
  const activeRange = RANGES.some((r) => r.id === p.activeRange) ? p.activeRange : "7d";

  return (
    <PortalPage
      title={p.businessName ? `${p.greetingText}, ${p.businessName}` : p.greetingText}
      titleTa={`${GREETING_TA[p.greetingText] ?? "வணக்கம்"}${p.businessName ? `, ${p.businessName}` : ""}`}
      sub="Orders, payments and chats that need you today."
      subTa="இன்று உங்கள் கவனம் தேவைப்படும் ஆர்டர்கள், பணம் மற்றும் உரையாடல்கள்."
      actions={
        <>
          {p.actions}
          {p.ordersOn && (
            <Link className="btn primary" href="/dashboard/orders?new=1">
              <Plus aria-hidden className="ic" />
              <T ta="புதிய ஆர்டர்">New order</T>
            </Link>
          )}
        </>
      }
    >
      <div className="stack">
        {p.alerts && <div className="stack">{p.alerts}</div>}

        {todos.length > 0 && (
          <section className="card">
            <div className="hd">
              <div>
                <h2>
                  {needing === 0 ? (
                    <T ta="இப்போது உடனடி கவனம் எதுவும் தேவையில்லை">Nothing needs you right now</T>
                  ) : (
                    <T ta={`இன்று உங்களுக்கு ${needing} பணிகள் உள்ளன`}>{`${needing} thing${needing === 1 ? "" : "s"} need${needing === 1 ? "s" : ""} you today`}</T>
                  )}
                </h2>
                <p>
                  {needing === 0 ? (
                    <T ta="அனைத்தும் முடிந்தது. புதிய ஆர்டர்களும் உரையாடல்களும் இங்கு காட்டப்படும்.">All caught up. New orders and chats will show here.</T>
                  ) : (
                    <T ta="இங்கிருந்து தொடங்குங்கள். மற்றவை காத்திருக்கலாம்.">Start here. Everything else can wait.</T>
                  )}
                </p>
              </div>
            </div>
            <div className={`grid ${todos.length === 3 ? "g3" : todos.length === 2 ? "g2" : "gx"}`}>{todos.map((t) => t.node)}</div>
          </section>
        )}

        <section>
          <div className="hd">
            <h2><T ta="வணிகம் எப்படி போகிறது">How the business is doing</T></h2>
            <Seg label="Period" value={activeRange} options={RANGES.map((r) => ({ ...r, href: r.id === "7d" ? "/dashboard" : `/dashboard?range=${r.id}` }))} />
          </div>
          <div className="grid g4 keep2">
            {p.kpis.map((k) => {
              const dl = delta(k);
              const labelLower = k.label.toLowerCase();
              const icon = labelLower.includes("sale") ? (
                <IndianRupee className="size-4" />
              ) : labelLower.includes("order") ? (
                <ShoppingBag className="size-4" />
              ) : labelLower.includes("chat") || labelLower.includes("repl") ? (
                <MessageCircle className="size-4" />
              ) : (
                <Repeat className="size-4" />
              );
              const tone = labelLower.includes("sale")
                ? "brand"
                : labelLower.includes("order")
                ? "info"
                : labelLower.includes("chat")
                ? "violet"
                : "gold";

              return (
                <Stat
                  key={k.label}
                  label={k.label}
                  value={k.value}
                  sub={
                    <div>
                      <div className={`d ${dl.tone}`}>{dl.text}</div>
                      <div style={{ marginTop: 8 }}>
                        <Spark data={k.spark} down={dl.tone === "down"} />
                      </div>
                    </div>
                  }
                  icon={icon}
                  tone={tone}
                  href={k.href}
                />
              );
            })}
          </div>
          <p className="muted small" style={{ marginTop: 8 }}>
            <T ta={`முந்தைய ${rangeWordTa} உடன் ஒப்பிடப்பட்டது.`}>{`Compared with the previous ${rangeWord}.`}</T>{" "}
            <Link href="/dashboard/report" className="linkb">
              <T ta="முழு அறிக்கைகள் ›">Full reports ›</T>
            </Link>
          </p>
        </section>

        <div className="grid g2">
          {p.wallet}
          {p.campaignsOn && (
            <section className="card">
              <div className="hd">
                <h2><T ta="அடுத்த பிரச்சாரம்">Next campaign</T></h2>
                <Link className="btn sm" href="/dashboard/campaigns"><T ta="அனைத்து பிரச்சாரங்கள்">All campaigns</T></Link>
              </div>
              <div className="list">
                {p.campaigns.length === 0 && (
                  <div className="row">
                    <div className="grow muted">Nothing scheduled.</div>
                  </div>
                )}
                {p.campaigns.map((c) => (
                  <div key={c.id} className="row">
                    <div className="grow">
                      <Link href={`/dashboard/campaigns/${c.id}`} className="t" style={{ textDecoration: "none" }}>
                        {c.name}
                      </Link>
                      <div className="muted small">{c.when}</div>
                    </div>
                    <Pill tone={campaignTone[c.status]}>{c.status}</Pill>
                  </div>
                ))}
                {p.reminderDays !== undefined && (
                  <div className="row">
                    <div className="grow">
                      <div className="t"><T ta="மறு ஆர்டர் நினைவூட்டல்">Reorder reminder</T></div>
                      <div className="muted small">
                        {p.reminderDays ? `${p.reminderDays} days after an order · Automatic` : "No reminders going out"}
                        {p.refillsDueCount > 0 ? ` · ${p.refillsDueCount} due this week` : ""}
                      </div>
                    </div>
                    <Pill tone={p.reminderDays ? "ok" : "mute"}>{p.reminderDays ? "On" : "Off"}</Pill>
                  </div>
                )}
                {p.today && (
                  <div className="row">
                    <div className="grow">
                      <div className="t"><T ta="இன்று இதுவரை">Today so far</T></div>
                      <div className="muted small">
                        {p.today.sent.toLocaleString("en-IN")} message{p.today.sent === 1 ? "" : "s"} sent · {p.today.replies.toLocaleString("en-IN")} repl{p.today.replies === 1 ? "y" : "ies"}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="tools" style={{ marginTop: 12 }}>
                <Link className="btn primary sm" href="/dashboard/campaigns/new">+ <T ta="பிரச்சாரம் உருவாக்கு">Create campaign</T></Link>
                {p.reminderDays !== undefined && (
                  <Link className="btn sm" href="/dashboard/campaigns?show=auto">
                    Reorder settings
                  </Link>
                )}
              </div>
            </section>
          )}
        </div>

        <AiBusinessCopilot initialBrief={p.brief} initialActions={p.briefActions} />
      </div>
    </PortalPage>
  );
}
