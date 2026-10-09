import { PackageCheck, PackageOpen, ShoppingBag } from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { buttonClass, Callout, Card, EmptyState, FilterChips, PageHeader, Section } from "@/components/ui";
import { cn } from "@/lib/cn";
import { db } from "@/lib/db";
import { fmtNumber } from "@/lib/format";
import type { OrderItem } from "@/lib/orders";
import { getScope, owned } from "@/lib/session";
import { sendableTemplates } from "@/lib/senders";
import { META_SAMPLES } from "@/lib/template";
import { ActionButton } from "@/components/action-button";
import { PAYMENT_TEMPLATE, paymentTemplateFor } from "@/lib/payments";
import { createOrderTemplates } from "../actions/orders";
import { NewOrder } from "./new-order";
import { OrderCard } from "./order-card";
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
      ? db.template.findMany({ where: { clientId: scope.clientId, status: "APPROVED", category: { not: "AUTHENTICATION" }, name: { notIn: [...ORDER_TEMPLATES, ...META_SAMPLES] }, ...(await sendableTemplates(scope.clientId)) }, select: { id: true, name: true }, orderBy: { name: "asc" } })
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
        actions={
          scope.clientId && canEdit ? (
            <>
              <Link href="/dashboard/orders/packing" aria-label="Packing list" className={cn(buttonClass("secondary"), "max-sm:w-11 max-sm:px-0")}>
                <PackageOpen aria-hidden className="size-4" /> <span className="max-sm:hidden">Packing list</span>
              </Link>
              <NewOrder />
            </>
          ) : undefined
        }
        inlineActions
        tabs={
          <FilterChips
            label="Order status"
            items={TABS.map((t) => ({
              href: t.key ? `/dashboard/orders?show=${t.key}` : "/dashboard/orders",
              label: t.label,
              count: fmtNumber(tabCount[t.key]),
              active: tab.key === t.key,
            }))}
          />
        }
      />

      {/* Phones put this setup notice after the orders, so today's orders come first. */}
      <div className="flex flex-col gap-4">
      {scope.clientId && notReady.length > 0 && (
        <Callout
          className="order-last sm:order-first"
          title="Order updates after 24 hours need approved templates."
          action={
            scope.canManage &&
            missing.length > 0 && (
              <ActionButton action={createOrderTemplates} confirm={`Create and submit ${missing.join(", ")} to Meta?`}>
                Create order templates
              </ActionButton>
            )
          }
        >
          Not ready yet: {notReady.join(", ")}.{" "}
          {missing.length === 0 ? "They're waiting for Meta's approval." : scope.canManage ? "Create them once and Meta usually approves within minutes." : "Ask your admin to create them."}
        </Callout>
      )}

      {orders.length ? (
        <ul className="grid gap-3 sm:gap-4 xl:grid-cols-2">
          {orders.map((o) => (
            <li key={o.id} className="min-w-0">
              <OrderCard order={o} items={o.items as OrderItem[]} showClient={!scope.clientId} canEdit={canEdit} />
            </li>
          ))}
        </ul>
      ) : (
        <Card>
          <EmptyState icon={show === "done" ? <PackageCheck className="size-5" /> : <ShoppingBag className="size-5" />} title="No orders here yet">
            When a customer sends a cart from your WhatsApp catalogue, it appears here with items, total and a one-tap confirmation.
          </EmptyState>
        </Card>
      )}
      </div>

      {/* Settings below the orders, so staff on a phone see today's orders first. */}
      {scope.canManage && scope.clientId && (
        <Section title="Order settings" description="Order message pictures, WhatsApp payments, refill reminders and win-back messages.">
          <Card>
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
              {/* eslint-disable-next-line @next/next/no-img-element -- our own public image */}
              <img src="/thenan-order-header.jpg" alt="Order message picture" width={64} height={64} className="size-16 shrink-0 rounded-control object-cover ring-1 ring-line" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium">Order messages with your picture</p>
                <p className="mt-0.5 text-xs text-muted">
                  {pictureStatus.map((p) => `${p.name.replace("thenan_order_", "")}: ${p.status ? p.status.toLowerCase() : "not created"}`).join(" · ")}. Used automatically once approved; the plain versions cover the wait.
                </p>
              </div>
              {pictureStatus.some((p) => !p.status) && (
                <ActionButton action={createOrderTemplates.bind(null, headerImage)} confirm="Create the picture versions of the order templates and submit them to Meta?">
                  Create with picture
                </ActionButton>
              )}
            </div>
          </Card>
          {client && (
            <div className="grid items-start gap-4 xl:grid-cols-2">
              <PaymentForm config={client.paymentConfig} own={{ name: PAYMENT_TEMPLATE, status: ownPaymentTemplate?.status ?? null }} using={paymentTemplate?.name ?? null} />
              <RefillForm days={client.refillDays} templateId={client.refillTemplateId} templates={approved} />
              <WinbackForm days={client.lapsedDays} templateId={client.winbackTemplateId} templates={approved} lapsed={lapsed} />
            </div>
          )}
        </Section>
      )}
    </>
  );
}
