import { PackageCheck, PackageOpen, ShoppingBag } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Badge, buttonClass, Card, EmptyState, PageHeader } from "@/components/ui";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { fmtDate, fmtNumber } from "@/lib/format";
import { money, orderRef, type OrderItem } from "@/lib/orders";
import { formatPhone } from "@/lib/phone";
import { getScope, owned } from "@/lib/session";
import { META_SAMPLES } from "@/lib/template";
import { ActionButton } from "@/components/action-button";
import { PAYMENT_TEMPLATE, paymentTemplateFor } from "@/lib/payments";
import { createOrderTemplates } from "../actions/orders";
import { NewOrder } from "./new-order";
import { OrderActions } from "./order-actions";
import { PaymentForm } from "./payment-form";
import { RefillForm } from "./refill-form";
import { WinbackForm } from "./winback-form";

/** The utility templates that let order updates go out after the customer's 24-hour window. */
const ORDER_TEMPLATES = ["order_confirmation", "order_dispatched", "order_delivered"];

export const metadata: Metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "", label: "Active", where: { status: { in: ["NEW", "CONFIRMED", "PAID", "DISPATCHED"] } } },
  { key: "new", label: "New", where: { status: "NEW" } },
  { key: "done", label: "Delivered", where: { status: "DELIVERED" } },
  { key: "cancelled", label: "Cancelled", where: { status: "CANCELLED" } },
  { key: "all", label: "All", where: {} },
] as const;

const TONE = { NEW: "amber", CONFIRMED: "blue", PAID: "blue", DISPATCHED: "violet", DELIVERED: "green", CANCELLED: "gray" } as const;

export default async function OrdersPage({ searchParams }: PageProps<"/dashboard/orders">) {
  const { show = "" } = await searchParams;
  const scope = await getScope();
  const tab = TABS.find((t) => t.key === show) ?? TABS[0];
  const mine = owned(scope);

  const [orders, counts, orderTemplates, client, approved, ownPaymentTemplate, paymentTemplate] = await Promise.all([
    db.order.findMany({
      where: { ...mine, ...(tab.where as object) },
      include: {
        customer: { select: { id: true, name: true, phone: true, location: true, client: { select: { name: true } } } },
        client: { select: { paymentConfig: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.order.groupBy({ by: ["status"], where: mine, _count: true }),
    scope.clientId ? db.template.findMany({ where: { clientId: scope.clientId, name: { in: [...ORDER_TEMPLATES, ...ORDER_TEMPLATES.map((n) => `thenan_${n}`)] } }, select: { name: true, status: true } }) : [],
    scope.clientId ? db.client.findUnique({ where: { id: scope.clientId }, select: { refillDays: true, refillTemplateId: true, lapsedDays: true, winbackTemplateId: true, paymentConfig: true } }) : null,
    scope.clientId && scope.canManage
      ? db.template.findMany({ where: { clientId: scope.clientId, status: "APPROVED", category: { not: "AUTHENTICATION" }, name: { notIn: [...ORDER_TEMPLATES, ...META_SAMPLES] } }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : [],
    scope.clientId ? db.template.findFirst({ where: { clientId: scope.clientId, name: PAYMENT_TEMPLATE }, select: { status: true } }) : null,
    scope.clientId ? paymentTemplateFor(scope.clientId) : null,
  ]);
  // An order update is covered when either the plain or the picture version is approved.
  const lapsed = scope.clientId && scope.canManage ? await db.customer.count({ where: { clientId: scope.clientId, tags: { has: "lapsed" }, optedOut: false } }) : 0;
  const notReady = ORDER_TEMPLATES.filter((name) => !orderTemplates.some((t) => (t.name === name || t.name === `thenan_${name}`) && t.status === "APPROVED"));
  const pictureStatus = ORDER_TEMPLATES.map((name) => ({ name: `thenan_${name}`, status: orderTemplates.find((t) => t.name === `thenan_${name}`)?.status ?? null }));
  const h = await headers();
  const headerImage = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}/thenan-order-header.jpg`;
  const missing = ORDER_TEMPLATES.filter((name) => !orderTemplates.some((t) => t.name === name));
  // Client staff pack and dispatch their own orders, so they get the order buttons too.
  const canEdit = scope.canOperate && (scope.canManage || !!scope.clientId);
  const n = (...s: string[]) => counts.filter((c) => s.includes(c.status)).reduce((sum, c) => sum + c._count, 0);
  const tabCount: Record<string, number> = {
    "": n("NEW", "CONFIRMED", "PAID", "DISPATCHED"),
    new: n("NEW"),
    done: n("DELIVERED"),
    cancelled: n("CANCELLED"),
    all: counts.reduce((sum, c) => sum + c._count, 0),
  };

  return (
    <>
      <PageHeader
        title="Orders"
        description="WhatsApp catalogue carts and orders you add by hand. Confirm, dispatch and deliver them here; the customer gets a WhatsApp update at each step."
        actions={scope.clientId && canEdit ? <><Link href="/dashboard/orders/packing" className={buttonClass("secondary")}><PackageOpen className="size-4" /> Packing list</Link><NewOrder /></> : undefined}
      />

      {scope.clientId && notReady.length > 0 && (
        <div className="mb-4 flex flex-col gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-600/20 sm:flex-row sm:items-center sm:justify-between">
          <p>
            <b>Order updates after 24 hours need approved templates.</b> Not ready yet: {notReady.join(", ")}.{" "}
            {missing.length === 0 ? "They're waiting for Meta's approval." : scope.canManage ? "Create them once and Meta usually approves within minutes." : "Ask your admin to create them."}
          </p>
          {scope.canManage && missing.length > 0 && (
            <ActionButton action={createOrderTemplates} confirm={`Create and submit ${missing.join(", ")} to Meta?`}>Create order templates</ActionButton>
          )}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key ? `/dashboard/orders?show=${t.key}` : "/dashboard/orders"}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition active:scale-95 sm:h-auto sm:py-1.5 sm:text-xs",
              tab.key === t.key ? "border-ink bg-ink text-white" : "border-line bg-white text-ink-2 hover:border-ink/30",
            )}
          >
            {t.label} <span className="tabular opacity-60">{fmtNumber(tabCount[t.key])}</span>
          </Link>
        ))}
      </div>


      {orders.length ? (
        <div className="space-y-4">
          {orders.map((o) => {
            const items = o.items as OrderItem[];
            return (
              <Card key={o.id}>
                <div className="space-y-3 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Link href={`/dashboard/customers/${o.customer.id}`} className="font-medium hover:underline">
                      {o.customer.name}
                    </Link>
                    <span className="tabular text-xs text-muted">{formatPhone(o.customer.phone)}</span>
                    {o.customer.location && <span className="text-xs text-muted">· {o.customer.location}</span>}
                    {!scope.clientId && <Badge>{o.customer.client.name}</Badge>}
                    <Badge tone={TONE[o.status]}>{o.status.toLowerCase()}</Badge>
                    <span className="ml-auto text-xs text-muted">
                      {orderRef(o)} · {fmtDate(o.createdAt, "EEE d MMM, h:mm a")}
                    </span>
                  </div>
                  <ul className="divide-y divide-line rounded-lg bg-canvas px-3 text-sm">
                    {items.map((i, k) => (
                      <li key={k} className="flex justify-between gap-3 py-2">
                        <span>
                          {i.quantity} × {i.name ?? i.id}
                        </span>
                        <span className="tabular text-muted">{money(i.price * i.quantity, i.currency)}</span>
                      </li>
                    ))}
                    <li className="flex justify-between gap-3 py-2 font-semibold">
                      <span>Total</span>
                      <span className="tabular">{money(o.total, o.currency)}</span>
                    </li>
                  </ul>
                  {o.note && (
                    <p className="text-sm">
                      <span className="text-muted">Customer note: </span>
                      {o.note}
                    </p>
                  )}
                  {(o.paidAt || o.paymentRequestedAt) && (
                    <p className="text-xs text-muted">
                      {o.paidAt
                        ? <>Paid on WhatsApp {fmtDate(o.paidAt, "d MMM, h:mm a")}{o.paymentTxnId && <> · UPI ref {o.paymentTxnId}</>}</>
                        : <>Payment requested {fmtDate(o.paymentRequestedAt, "d MMM, h:mm a")} · waiting for the customer</>}
                    </p>
                  )}
                  <OrderActions
                    id={o.id}
                    status={o.status}
                    note={o.internalNote}
                    canEdit={canEdit}
                    payment={o.client.paymentConfig && o.total > 0 && !o.paidAt ? (o.paymentRequestedAt ? "again" : "first") : null}
                  />
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <EmptyState icon={show === "done" ? <PackageCheck className="size-5" /> : <ShoppingBag className="size-5" />} title="No orders here yet">
            When a customer sends a cart from your WhatsApp catalogue, it appears here with items, total and a one-tap confirmation.
          </EmptyState>
        </Card>
      )}
      {/* Settings below the orders, so staff on a phone see today's orders first. */}
      {scope.canManage && scope.clientId && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-ink">Order settings</h2>
          {scope.canManage && scope.clientId && (
            <Card className="mb-4">
              <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
                {/* eslint-disable-next-line @next/next/no-img-element -- our own public image */}
                <img src="/thenan-order-header.jpg" alt="Order message picture" className="size-16 shrink-0 rounded-xl object-cover ring-1 ring-line" />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">Order messages with your picture</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {pictureStatus.map((p) => `${p.name.replace("thenan_order_", "")}: ${p.status ? p.status.toLowerCase() : "not created"}`).join(" · ")}. Used automatically once approved; the plain versions cover the wait.
                  </p>
                </div>
                {pictureStatus.some((p) => !p.status) && (
                  <ActionButton action={createOrderTemplates.bind(null, headerImage)} confirm="Create the picture versions of the order templates and submit them to Meta?">Create with picture</ActionButton>
                )}
              </div>
            </Card>
          )}

          {scope.canManage && client && <PaymentForm config={client.paymentConfig} own={{ name: PAYMENT_TEMPLATE, status: ownPaymentTemplate?.status ?? null }} using={paymentTemplate?.name ?? null} />}
          {scope.canManage && client && <RefillForm days={client.refillDays} templateId={client.refillTemplateId} templates={approved} />}
          {scope.canManage && client && <WinbackForm days={client.lapsedDays} templateId={client.winbackTemplateId} templates={approved} lapsed={lapsed} />}
        </section>
      )}
    </>
  );
}
