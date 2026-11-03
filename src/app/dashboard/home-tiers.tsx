import type { ReactNode } from "react";
import { CheckCircle2, IndianRupee, MessageCircle, Plus, Repeat, ShoppingBag } from "@/components/icons";
import { Stat } from "@/components/ui";
import Link from "@/components/intent-link";
import { ScrollReveal, StaggerGroup, StaggerItem } from "@/components/motion";
import { AiBusinessCopilot } from "./ai-copilot";
import { inr } from "./portal-format";
import { Pill, PortalPage, Seg, Spark, T } from "./portal-ui";
import "./home.css";

/*
 * Home, in the order an owner asks: what needs me now (the work waiting, most urgent first), how the business is
 * doing (four figures for 7/30/90 days), what is coming up (campaigns, reorder reminders, WhatsApp spend), and what
 * to do after that (the daily brief). A short, live summary of today. Every figure comes from the client's own orders, chats and
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

/** The longest-waiting chat first wrote more than a day ago. */
function waitedOverADay(since: Date | null) {
  return Boolean(since && Date.now() - since.getTime() > 24 * 3_600_000);
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

type Todo = {
  key: string;
  /** How many need doing; 0 = nothing waiting (shown as a quiet "done" link instead of a tile). */
  n: number;
  /** Older than a day (chats): shown first and in the problem colour. */
  urgent?: boolean;
  href: string;
  big: string;
  title: string;
  titleTa: string;
  sub: string;
  subTa?: string;
  go: string;
  goTa: string;
  /** The words for a zero count, e.g. "No unpaid carts". */
  none: string;
  noneTa: string;
};

function TodoTile({ t, first }: { t: Todo; first: boolean }) {
  return (
    <Link className={`todo${first ? " first" : ""}${t.urgent ? " urgent" : ""}`} href={t.href} data-todo={t.key}>
      <span className="big">{t.big}</span>
      <span>
        <b><T ta={t.titleTa}>{t.title}</T></b>
        <br />
        <span className="small sub"><T ta={t.subTa}>{t.sub}</T></span>
      </span>
      <span className="go"><T ta={t.goTa}>{t.go}</T> ›</span>
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
  // Waiting longer than a day is the one thing that gets worse by itself (customers give up), so it goes first.
  const chatsUrgent = waitedOverADay(p.oldestWaitingAt);
  const todos = ([
    p.ordersOn && {
      key: "carts",
      n: p.unpaidCartsCount,
      href: "/dashboard/orders?show=unpaid",
      big: inr(p.unpaidCartsValue),
      title: "Unpaid carts",
      titleTa: "செலுத்தப்படாத கார்ட்டுகள்",
      // Orders, not customers: one customer can have two unpaid orders, and the list counts orders.
      sub: `${p.unpaidCartsCount} order${p.unpaidCartsCount === 1 ? "" : "s"} waiting for payment`,
      subTa: `பணம் வர வேண்டிய ${p.unpaidCartsCount} ஆர்டர்${p.unpaidCartsCount === 1 ? "" : "கள்"}`,
      go: "Chase",
      goTa: "நினைவூட்டு",
      none: "No unpaid carts",
      noneTa: "செலுத்தப்படாத கார்ட் இல்லை",
    },
    p.ordersOn && {
      key: "pack",
      n: p.toPackCount,
      href: "/dashboard/orders?show=topack",
      big: String(p.toPackCount),
      title: "Orders to pack",
      titleTa: "பேக் செய்ய வேண்டியவை",
      sub: packText(p.toPackSplit, false),
      subTa: packText(p.toPackSplit, true),
      go: "Pack",
      goTa: "பேக்",
      none: "Nothing to pack",
      noneTa: "பேக் செய்ய எதுவும் இல்லை",
    },
    p.repliesOn && {
      key: "chats",
      n: p.unhandledRepliesCount,
      urgent: chatsUrgent,
      href: "/dashboard/replies?show=open",
      big: String(p.unhandledRepliesCount),
      title: "Chats waiting",
      titleTa: "காத்திருக்கும் உரையாடல்கள்",
      sub: waitText(p.oldestWaitingAt, false),
      subTa: waitText(p.oldestWaitingAt, true),
      go: "Reply",
      goTa: "பதில்",
      none: "No chats waiting",
      noneTa: "காத்திருக்கும் உரையாடல் இல்லை",
    },
  ] as (Todo | false)[]).filter((t): t is Todo => Boolean(t));
  // The heading counts the kinds of work waiting ("2 of 3"); kinds with nothing waiting become a quiet ✓ link below.
  const waiting = todos.filter((t) => t.n > 0).sort((a, b) => Number(Boolean(b.urgent)) - Number(Boolean(a.urgent)));
  const quiet = todos.filter((t) => t.n === 0);
  const needing = waiting.length;
  const rangeWord = RANGES.find((r) => r.id === p.activeRange)?.label ?? "7 days";
  const rangeWordTa = RANGES.find((r) => r.id === p.activeRange)?.ta ?? "7 நாட்கள்";
  const activeRange = RANGES.some((r) => r.id === p.activeRange) ? p.activeRange : "7d";

  return (
    <PortalPage
      title={p.businessName ? `${p.greetingText}, ${p.businessName}` : p.greetingText}
      titleTa={`${GREETING_TA[p.greetingText] ?? "வணக்கம்"}${p.businessName ? `, ${p.businessName}` : ""}`}
      sub={
        p.today
          ? `Today so far: ${p.today.sent.toLocaleString("en-IN")} message${p.today.sent === 1 ? "" : "s"} sent · ${p.today.replies.toLocaleString("en-IN")} repl${p.today.replies === 1 ? "y" : "ies"} from customers.`
          : p.ordersOn
          ? "Orders, payments and chats that need you today."
          : "Chats and campaigns that need you today."
      }
      subTa={
        p.today
          ? `இன்று இதுவரை: ${p.today.sent.toLocaleString("en-IN")} செய்திகள் அனுப்பப்பட்டன · வாடிக்கையாளர்களிடமிருந்து ${p.today.replies.toLocaleString("en-IN")} பதில்கள்.`
          : p.ordersOn
          ? "இன்று உங்கள் கவனம் தேவைப்படும் ஆர்டர்கள், பணம் மற்றும் உரையாடல்கள்."
          : "இன்று உங்கள் கவனம் தேவைப்படும் உரையாடல்கள் மற்றும் பிரச்சாரங்கள்."
      }
      actions={
        <>
          {p.actions}
          {p.ordersOn && (
            <Link className="btn primary" href="/dashboard/orders?new=1">
              <Plus aria-hidden className="ic shrink-0" />
              <T ta="புதிய ஆர்டர்">New order</T>
            </Link>
          )}
        </>
      }
    >
      <div className="stack">
        {p.alerts && <div className="stack">{p.alerts}</div>}

        {todos.length > 0 && (
          <ScrollReveal as="section" className="card home-now" duration={500} aria-labelledby="home-now">
            <div className="hd">
              <div>
                <h2 id="home-now">
                  {needing === 0 ? (
                    <T ta="இப்போது உடனடி கவனம் எதுவும் தேவையில்லை">Nothing needs you right now</T>
                  ) : todos.length === 1 ? (
                    <T ta="இது உங்கள் கவனம் தேவை">This needs you now</T>
                  ) : (
                    <T ta={`${todos.length}-ல் ${needing} உங்கள் கவனம் தேவை`}>{`${needing} of ${todos.length} need you now`}</T>
                  )}
                </h2>
                <p>
                  {needing === 0 ? (
                    p.ordersOn ? <T ta="அனைத்தும் முடிந்தது. புதிய ஆர்டர்களும் உரையாடல்களும் இங்கு காட்டப்படும்.">All caught up. New orders and chats will show here.</T> : <T ta="அனைத்தும் முடிந்தது. புதிய உரையாடல்கள் இங்கு காட்டப்படும்.">All caught up. New chats will show here.</T>
                  ) : (
                    <T ta="முதலாவதிலிருந்து தொடங்குங்கள். மற்றவை காத்திருக்கலாம்.">Start with the first one. Everything else can wait.</T>
                  )}
                </p>
              </div>
            </div>
            {waiting.length > 0 && (
              <StaggerGroup className="home-todos" style={{ "--n": waiting.length } as React.CSSProperties}>
                {waiting.map((t, i) => (
                  <StaggerItem key={t.key} index={i} className="h-full">
                    <TodoTile t={t} first={i === 0} />
                  </StaggerItem>
                ))}
              </StaggerGroup>
            )}
            {quiet.length > 0 && (
              <ul className="home-quiet" aria-label="Nothing waiting">
                {quiet.map((t) => (
                  <li key={t.key}>
                    <Link href={t.href} data-todo={t.key}>
                      <CheckCircle2 aria-hidden className="ic" />
                      <T ta={t.noneTa}>{t.none}</T>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </ScrollReveal>
        )}

        <section aria-labelledby="home-kpis">
          <ScrollReveal duration={450}>
            <div className="hd">
              <h2 id="home-kpis"><T ta="வணிகம் எப்படி போகிறது">How the business is doing</T></h2>
              <Seg label="Period" value={activeRange} options={RANGES.map((r) => ({ ...r, href: r.id === "7d" ? "/dashboard" : `/dashboard?range=${r.id}` }))} />
            </div>
          </ScrollReveal>
          <StaggerGroup className="grid g4 keep2">
            {p.kpis.map((k, i) => {
              const dl = delta(k);
              const labelLower = k.label.toLowerCase();
              const icon = labelLower.includes("sale") ? (
                <IndianRupee className="size-4 shrink-0" />
              ) : labelLower.includes("order") ? (
                <ShoppingBag className="size-4 shrink-0" />
              ) : labelLower.includes("chat") || labelLower.includes("repl") ? (
                <MessageCircle className="size-4 shrink-0" />
              ) : (
                <Repeat className="size-4 shrink-0" />
              );
              const tone = labelLower.includes("sale")
                ? "brand"
                : labelLower.includes("order")
                ? "info"
                : labelLower.includes("chat")
                ? "violet"
                : "gold";

              return (
                <StaggerItem key={k.label} index={i} className="h-full">
                  <Stat
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
                </StaggerItem>
              );
            })}
          </StaggerGroup>
          <p className="muted small" style={{ marginTop: 8 }}>
            <T ta={`முந்தைய ${rangeWordTa} உடன் ஒப்பிடப்பட்டது.`}>{`Compared with the previous ${rangeWord}.`}</T>{" "}
            <Link href="/dashboard/report" className="linkb">
              <T ta="முழு அறிக்கைகள் ›">Full reports ›</T>
            </Link>
          </p>
        </section>

        {(p.campaignsOn || p.wallet) && (
          <div className="grid g2 home-next">
            {p.campaignsOn && (
              <ScrollReveal as="section" className="card h-full" duration={500} aria-labelledby="home-next">
                <div className="hd">
                  <div>
                    <h2 id="home-next"><T ta="அடுத்து வருபவை">Coming up</T></h2>
                    <p><T ta="திட்டமிட்ட பிரச்சாரங்களும் மறு ஆர்டர் நினைவூட்டல்களும்">Scheduled campaigns and reorder reminders</T></p>
                  </div>
                  <Link className="btn sm" href="/dashboard/campaigns"><T ta="அனைத்து பிரச்சாரங்கள்">All campaigns</T></Link>
                </div>
                <div className="list">
                  {p.campaigns.length === 0 && (
                    <div className="row">
                      <div className="grow muted"><T ta="எதுவும் திட்டமிடப்படவில்லை.">Nothing scheduled.</T></div>
                    </div>
                  )}
                  {p.campaigns.map((c) => (
                    <div key={c.id} className="row" data-campaign-row>
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
                </div>
                <div className="tools" style={{ marginTop: 12 }}>
                  <Link className="btn sm" href="/dashboard/campaigns/new">+ <T ta="பிரச்சாரம் உருவாக்கு">Create campaign</T></Link>
                  {p.reminderDays !== undefined && (
                    <Link className="btn sm ghost" href="/dashboard/campaigns?show=auto">
                      <T ta="மறு ஆர்டர் அமைப்புகள்">Reorder settings</T>
                    </Link>
                  )}
                </div>
              </ScrollReveal>
            )}
            {p.wallet && (
              <ScrollReveal duration={500} delay={80} className="h-full">
                {p.wallet}
              </ScrollReveal>
            )}
          </div>
        )}

        <ScrollReveal duration={500} delay={100}>
          <AiBusinessCopilot initialBrief={p.brief} initialActions={p.briefActions} />
        </ScrollReveal>
      </div>
    </PortalPage>
  );
}
