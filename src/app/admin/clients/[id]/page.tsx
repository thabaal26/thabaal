import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { CheckCircle2, Circle } from "@/components/icons";
import { ActionButton } from "@/components/action-button";
import { Badge, QualityBadge } from "@/components/ui";
import { cycleName, loadClientRows, planName } from "@/lib/admin-data";
import { adminQueue } from "@/lib/admin-queue";
import { cleanOverrides, legacyOverrides, portalDefault } from "@/lib/appearance";
import { CLIENT_PLAN_PRESETS, CLIENT_SECTIONS, detectPlanPreset } from "@/lib/client-sections";
import { db } from "@/lib/db";
import { APP_TZ } from "@/lib/format";
import { numberHealth } from "@/lib/limits";
import { getSettings } from "@/lib/provider";
import { requireAdminPage } from "@/lib/session";
import { razorpayTestOn } from "@/lib/razorpay-billing";
import { rzpSetTestPackage } from "../../../dashboard/actions/razorpay";
import { deleteClientUser } from "../../../dashboard/actions/clients";
import { AdminPlanPanel } from "../../../dashboard/account/admin-plan-panel";
import { ClientAppearance } from "../../../dashboard/appearance-editor";
import {
  AccessSelect,
  AddLoginForm,
  AddNumberForm,
  BrandingForm,
  ClientSectionsForm,
  DeleteClientButton,
  NumberActions,
  RefreshNumbersButton,
  ResetPasswordButton,
  SendingRulesForm,
  TokenForm,
} from "../../../dashboard/clients/client-forms";
import { OpenToChange, ViewAsButton } from "../../support/support-tools";
import { K, Kpis, N, Pill, R, initials, pctOf } from "../../ui";

export const metadata: Metadata = { title: "Client" };
export const dynamic = "force-dynamic";

const day = (d: Date) => formatInTimeZone(d, APP_TZ, "d MMM yyyy");

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const now = new Date();
  const [{ rows, purchases }, c, settings, queue] = await Promise.all([
    loadClientRows(now),
    db.client.findUnique({
      where: { id },
      include: {
        users: { select: { id: true, name: true, email: true, access: true, createdAt: true }, orderBy: { createdAt: "asc" } },
        numbers: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }], include: { _count: { select: { campaigns: true } } } },
        _count: { select: { customers: true, campaigns: true, templates: true, pending: true } },
      },
    }),
    getSettings(),
    adminQueue(now, id),
  ]);
  const r = rows.find((x) => x.id === id);
  if (!c || !r) notFound();
  const health = new Map((await numberHealth(c.id)).map((h) => [h.id, h]));
  const history = purchases.filter((p) => p.clientId === id).reverse();
  const hasHistory = history.some((p) => p.status === "VERIFIED");
  const accounts = new Set(c.numbers.map((n) => n.businessAccountId)).size;
  const disabledSections = c.disabledSections ?? [];
  const presetMeta = CLIENT_PLAN_PRESETS.find((p) => p.id === detectPlanPreset(disabledSections));
  const phone = (c.supportPhone ?? "").replace(/\D/g, "");
  const waPhone = phone.length === 10 ? `91${phone}` : phone;
  const sent = r.messages30.sent;

  const use: [string, number, number | null][] = [
    ["WhatsApp numbers", r.usage.numbers, r.limits?.num ?? null],
    ["Staff logins", r.usage.staff, r.limits?.staff ?? null],
    ["Campaigns this month", r.usage.campaignsMonth, r.limits?.camp ?? null],
    ["Approved templates", r.usage.templates, r.limits?.tmpl ?? null],
  ];

  return (
    <>
      <p style={{ marginBottom: 12 }}>
        <Link href="/admin/clients" className="muted small">
          ← All clients
        </Link>
      </p>
      <div className="who" style={{ marginBottom: 14 }}>
        <span className="av" style={{ width: 48, height: 48, fontSize: 17 }}>
          {initials(c.name)}
        </span>
        <div>
          <div className="n" style={{ font: "600 24px var(--display)" }}>
            {c.name}
          </div>
          <div className="s">
            {[r.owner ? `${r.owner.name} <${r.owner.email}>` : "No owner login yet", c.homeCity, c.supportPhone].filter(Boolean).join(" · ")}
          </div>
        </div>
      </div>
      <div className="tools mb16" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <Pill tone={r.stateTone}>{r.stateLabel}</Pill>
        <Pill tone="plain">{planName(r.plan)}</Pill>
        {r.cycle && <Pill tone="plain">{cycleName(r.cycle)}</Pill>}
        <Pill tone={r.autoPay === "on" ? "ok" : r.autoPay === "failing" ? "bad" : "plain"}>
          {r.autoPay === "on" ? "Auto-pay on" : r.autoPay === "failing" ? "Auto-pay failing" : r.autoPay === "off" ? "Auto-pay turned off" : "Pays by hand"}
        </Pill>
        <Pill tone={r.health}>{r.healthLabel}</Pill>
        <span className="muted small">With thabaal since {day(c.createdAt)}</span>
      </div>

      <Kpis
        className="mb16"
        items={[
          {
            label: "They pay",
            value: r.monthly ? `${R(r.monthly)}/mo` : "–",
            note: r.endsAt ? `${r.state === "ok" || r.state === "due" ? "renews" : "ended"} ${day(r.endsAt)} · ${R(r.renewal)}` : r.state === "unmanaged" ? "no plan needed" : "never paid",
            tone: "mute",
          },
          { label: "Their sales", value: K(r.salesTotal), note: `${N(r.ordersTotal)} orders · ${K(r.salesMonth)} this month`, tone: "mute" },
          { label: "Meta charges", value: R(r.spendMonth), note: "this month, estimated, paid to Meta", tone: "mute" },
          { label: "Messages sent", value: N(sent), note: `last 30 days · ${pctOf(r.messages30.read, sent)}% read`, tone: "mute" },
        ]}
      />

      <div className="g2x mb16">
        <div className="card">
          <h2 style={{ marginBottom: 10 }}>How much of the plan they use</h2>
          {r.limits ? (
            <div className="hb">
              {use.map(([label, v, lim]) => {
                const p = lim ? Math.min(100, Math.round((v / lim) * 100)) : 0;
                return (
                  <div key={label} className="r">
                    <span>{label}</span>
                    <span className="t">
                      <i style={{ width: `${Math.max(3, p)}%`, background: p >= 90 ? "var(--bad)" : p >= 70 ? "var(--bar2)" : "var(--bar4)" }} />
                    </span>
                    <b>
                      {v} / {lim}
                    </b>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="muted small">No plan in force, so there are no limits to compare. They have {use.map(([l, v]) => `${v} ${l.toLowerCase()}`).join(", ")}.</p>
          )}
          <h2 style={{ margin: "18px 0 8px" }}>Their WhatsApp results</h2>
          <div className="list">
            <div className="row">
              <div className="grow">Messages sent (30 days)</div>
              <b>{N(sent)}</b>
            </div>
            <div className="row">
              <div className="grow">Read</div>
              <b>{sent ? `${pctOf(r.messages30.read, sent)}%` : "–"}</b>
            </div>
            <div className="row">
              <div className="grow">Customer replies (30 days)</div>
              <b>{N(r.messages30.replied)}</b>
            </div>
            <div className="row">
              <div className="grow">Failed (30 days)</div>
              <b>{N(r.messages30.failed)}</b>
            </div>
            <div className="row">
              <div className="grow">Customers on record</div>
              <b>{N(r.customers)}</b>
            </div>
          </div>
        </div>

        <div className="card">
          <h2 style={{ marginBottom: 10 }}>What you can do</h2>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
            <ViewAsButton clientId={c.id} />
            <OpenToChange clientId={c.id} />
            <ActionButton action={rzpSetTestPackage.bind(null, c.id, !razorpayTestOn(c))} variant="ghost">
              {razorpayTestOn(c) ? "Turn off ₹1 Razorpay test" : "Offer ₹1 Razorpay test"}
            </ActionButton>
            {waPhone ? (
              <a className="btn sm" href={`https://wa.me/${waPhone}`} target="_blank" rel="noopener noreferrer">
                Message on WhatsApp
              </a>
            ) : (
              <span className="muted small" style={{ alignSelf: "center" }}>
                No support phone saved, so WhatsApp is off (add one under Branding below).
              </span>
            )}
          </div>
          {r.reasons.length > 0 && (
            <div className="note mb16">
              <b>Why {r.healthLabel.toLowerCase()}:</b> {r.reasons.join(", ")}.
            </div>
          )}
          <h2 style={{ marginBottom: 10 }}>What happened</h2>
          <div className="tl">
            {history.map((p) => (
              <div key={p.id} className={`e ${p.status === "VERIFIED" ? "ok" : p.status === "REJECTED" ? "bad" : ""}`}>
                <b>
                  {planName(p.plan)} · {cycleName(p.cycle)} · {R(p.amountPaise / 100)} ·{" "}
                  {p.status === "VERIFIED" ? (p.method === "ADMIN_RECORD" ? "recorded by Thabaal" : p.method === "RAZORPAY" ? "paid via Razorpay" : "verified") : p.status === "PENDING" ? "waiting for you to check" : p.status.toLowerCase()}
                </b>
                <div className="d">
                  {p.startsAt && p.endsAt ? `${day(p.startsAt)} to ${day(p.endsAt)}` : `sent ${day(p.createdAt)}`}
                  {p.utr ? ` · ${p.method === "RAZORPAY" ? "Razorpay" : "UPI"} ${p.utr}` : ""}
                </div>
              </div>
            ))}
            {r.lastActivity && (
              <div className="e">
                <b>Last activity</b>
                <div className="d">{formatInTimeZone(r.lastActivity, APP_TZ, "d MMM yyyy, h:mm a")} (message, reply or order)</div>
              </div>
            )}
            <div className="e ok">
              <b>Joined thabaal</b>
              <div className="d">{day(c.createdAt)}</div>
            </div>
          </div>
        </div>
      </div>

      <AdminPlanPanel rows={queue} clientId={c.id} clientName={c.name} hasHistory={hasHistory} planRequired={c.planRequired} accessLabel={r.state} />

      <div className="card setup">
        <div className="hd">
          <div>
            <h2>Setup</h2>
            <p>Logins, WhatsApp numbers, sections, look and sending rules for {c.name}.</p>
          </div>
          <DeleteClientButton clientId={c.id} name={c.name} />
        </div>

        <section>
          <h3>Logins</h3>
          {c.users.length ? (
            <ul className="mt-2 divide-y divide-line rounded-card border border-line">
              {c.users.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2.5">
                  <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
                    <p className="truncate text-sm font-medium text-ink">{u.name}</p>
                    <p className="truncate text-xs text-muted">{u.email}</p>
                  </div>
                  <AccessSelect userId={u.id} access={u.access} />
                  <ResetPasswordButton userId={u.id} email={u.email} />
                  <ActionButton action={deleteClientUser.bind(null, u.id)} variant="ghost" confirm={`Remove ${u.email}? They won't be able to sign in.`} aria-label={`Remove ${u.email}`}>
                    Remove
                  </ActionButton>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">No logins yet.</p>
          )}
          <AddLoginForm clientId={c.id} />
        </section>

        <section>
          <div className="flex items-center justify-between gap-2">
            <h3>WhatsApp numbers</h3>
            {c.numbers.length > 0 && <RefreshNumbersButton clientId={c.id} />}
          </div>
          <TokenForm clientId={c.id} hasToken={!!c.waToken} />
          {c.numbers.length ? (
            <ul className="mt-3 divide-y divide-line rounded-card border border-line">
              {c.numbers.map((n) => (
                <li key={n.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                  {n.token || c.waToken ? <CheckCircle2 aria-label="Has a token" className="size-4 shrink-0 text-success" /> : <Circle aria-label="No token" className="size-4 shrink-0 text-line-strong" />}
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-ink">
                      {n.label}
                      {n.isDefault && <Badge tone="green">Default</Badge>}
                      {n.verifiedName === "Test Number" && <Badge tone="amber">Test</Badge>}
                      <QualityBadge rating={n.qualityRating} />
                    </p>
                    <p className="tabular truncate text-xs text-muted">
                      {n.displayPhone ?? "—"}
                      {n.verifiedName && n.verifiedName !== "Test Number" ? ` · ${n.verifiedName}` : ""}
                      {accounts > 1 ? ` · account ${n.businessAccountId}` : ""}
                      {n._count.campaigns ? ` · ${n._count.campaigns} campaign${n._count.campaigns > 1 ? "s" : ""}` : ""}
                    </p>
                    {health.get(n.id) && (
                      <p className="text-xs text-muted">
                        Limit {health.get(n.id)!.tier}/day{n.dailyCap != null ? ` · warm-up cap ${n.dailyCap}/day` : ""} · {health.get(n.id)!.used} messaged in 24 h
                      </p>
                    )}
                  </div>
                  <NumberActions id={n.id} label={n.label} isDefault={n.isDefault} dailyCap={n.dailyCap} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-muted">No numbers yet, so this business can&apos;t send until one is connected.</p>
          )}
          <AddNumberForm clientId={c.id} hasToken={!!c.waToken} />
        </section>

        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3>Portal sections</h3>
              <p className="muted small">Turn sections on or off for this business.</p>
            </div>
            <Badge tone={disabledSections.length === 0 ? "green" : "amber"}>
              {presetMeta ? presetMeta.label : `Custom (${CLIENT_SECTIONS.length - disabledSections.length} of ${CLIENT_SECTIONS.length} sections)`}
            </Badge>
          </div>
          <ClientSectionsForm clientId={c.id} initialDisabled={disabledSections} />
        </section>

        <section>
          <h3>Appearance</h3>
          <ClientAppearance clientId={c.id} clientName={c.name} initial={{ ...legacyOverrides(c), ...cleanOverrides(c.appearance) }} portal={portalDefault(settings.appearance)} />
        </section>

        <section>
          <h3>Sending rules</h3>
          <p className="muted small" style={{ marginBottom: 10 }}>
            Customers who got an offer recently are skipped, and marketing never goes out at night. Utility messages aren&apos;t affected.
          </p>
          <SendingRulesForm clientId={c.id} initial={{ marketingGapHours: c.marketingGapHours, quietFrom: c.quietFrom, quietTo: c.quietTo }} />
        </section>

        <section>
          <h3>Branding and contact</h3>
          <BrandingForm
            clientId={c.id}
            name={c.name}
            initial={{
              brandPrimary: c.brandPrimary ?? "",
              brandAccent: c.brandAccent ?? "",
              logoUrl: c.logoUrl ?? "",
              bannerUrl: c.bannerUrl ?? "",
              tagline: c.tagline ?? "",
              website: c.website ?? "",
              supportPhone: c.supportPhone ?? "",
              defaultImageUrl: c.defaultImageUrl ?? "",
              homeCity: c.homeCity ?? "",
              businessType: c.businessType ?? "",
              orderPrefix: c.orderPrefix ?? "",
            }}
          />
        </section>

        <section>
          <h3>Wallet</h3>
          <p className="muted small" style={{ marginBottom: 10 }}>
            Billing mode: <b>{c.billingMode === "wallet" ? "Thabaal wallet" : "pays Meta directly"}</b>. Wallet rates, corrections and recharges are on their Wallet page.
          </p>
          <OpenToChange clientId={c.id} href="/dashboard/wallet" label="Open their wallet" />
        </section>
      </div>
    </>
  );
}
