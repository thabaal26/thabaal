import type { Metadata } from "next";
import { getCatalogWithProducts } from "@/lib/catalog";
import { db } from "@/lib/db";
import { readPaySettings } from "@/lib/pay-settings";
import { getScope, owned } from "@/lib/session";
import { PortalPage } from "../portal-ui";
import { OrdersView } from "./orders-view";
import { DEFAULT_FLOW, readFlow, type OrderFlowKey } from "@/lib/order-flow";
import type { CatalogProductOption } from "./order-items-editor";
import type { OrderItem } from "@/lib/orders";
import { planGate } from "@/app/dashboard/plan-lock";

export const metadata: Metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const locked = await planGate();
  if (locked) return locked;
  const sp = await searchParams;
  const scope = await getScope();
  const mine = owned(scope);

  const rawTab = typeof sp.tab === "string" ? sp.tab : typeof sp.view === "string" ? sp.view : "";
  const initialTab: "orders" | "pack" = rawTab === "pack" ? "pack" : "orders";
  const initialShow = typeof sp.show === "string" ? sp.show : "all";
  const initialPay = typeof sp.pay === "string" ? sp.pay : "all";
  const initialSrc = typeof sp.src === "string" ? sp.src : "all";
  const initialDate = typeof sp.range === "string" ? sp.range : typeof sp.date === "string" ? sp.date : "all";
  // Product pages link here with ?product=<name>; it searches the order lines for that product.
  const initialQ = typeof sp.q === "string" ? sp.q : typeof sp.product === "string" ? sp.product : "";

  const [rawOrders, clientData, catalogData] = await Promise.all([
    db.order.findMany({
      where: mine,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            location: true,
            locationRaw: true,
            client: { select: { name: true } },
          },
        },
        client: { select: { name: true, paymentConfig: true, orderFlow: true, paySettings: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 400,
    }),
    scope.clientId
      ? db.client.findUnique({
          where: { id: scope.clientId },
          select: { name: true, paymentConfig: true, orderFlow: true },
        })
      : null,
    scope.clientId ? getCatalogWithProducts(scope.clientId) : null,
  ]);

  const canEdit = scope.canOperate && (scope.canManage || !!scope.clientId);

  const catalogProducts: CatalogProductOption[] = (catalogData?.products ?? []).map((p) => ({
    id: p.id,
    retailerId: p.retailerId,
    name: p.name,
    priceAmount: p.priceAmount,
    category: p.category,
    inStock: p.inStock,
  }));

  const orderFlow = (readFlow(clientData?.orderFlow ?? DEFAULT_FLOW) as OrderFlowKey) || DEFAULT_FLOW;

  const orders = rawOrders.map((o) => ({
    id: o.id,
    number: o.number,
    ref: o.ref,
    status: o.status,
    total: o.total,
    currency: o.currency,
    note: o.note,
    internalNote: o.internalNote,
    createdAt: o.createdAt,
    packedAt: o.packedAt,
    confirmedAt: o.confirmedAt,
    dispatchedAt: o.dispatchedAt,
    deliveredAt: o.deliveredAt,
    waMessageId: o.waMessageId,
    paidAt: o.paidAt,
    paymentTxnId: o.paymentTxnId,
    paymentUtr: o.paymentUtr,
    paymentRequestedAt: o.paymentRequestedAt,
    paymentReminderAt: o.paymentReminderAt,
    paymentMethod: o.paymentMethod,
    paymentSource: o.paymentSource,
    paidAmount: o.paidAmount,
    paymentClaimedAt: o.paymentClaimedAt,
    paymentClaimNote: o.paymentClaimNote,
    paymentFailedAt: o.paymentFailedAt,
    paymentFailReason: o.paymentFailReason,
    collectedBy: o.collectedBy,
    refundedAt: o.refundedAt,
    refundAmount: o.refundAmount,
    refundNote: o.refundNote,
    pointsRedeemed: o.pointsRedeemed,
    items: (o.items as OrderItem[]) ?? [],
    customer: {
      id: o.customer.id,
      name: o.customer.name,
      phone: o.customer.phone,
      location: o.customer.location,
      locationRaw: o.customer.locationRaw,
      client: o.customer.client,
    },
    client: {
      paymentConfig: o.client?.paymentConfig ?? null,
      orderFlow: o.client?.orderFlow ?? null,
      // Payment settings › Cash on delivery: the COD buttons show only while it's on.
      codOn: readPaySettings(o.client?.paySettings, o.client?.paymentConfig).codOn,
    },
  }));

  return (
    <PortalPage
      title="Orders"
      titleTa="ஆர்டர்கள்"
      sub="Track, pack, dispatch and deliver every order."
      subTa="ஒவ்வொரு ஆர்டரையும் கண்காணித்து, பேக் செய்து, அனுப்பி, டெலிவரி செய்யுங்கள்."
    >
      <OrdersView
        orders={orders}
        catalogProducts={catalogProducts}
        client={{
          name: clientData?.name ?? "All businesses",
          orderFlow,
          paymentConfig: Boolean(clientData?.paymentConfig),
        }}
        canEdit={canEdit}
        scopeClientId={scope.clientId}
        initialTab={initialTab}
        initialShow={initialShow}
        initialPay={initialPay}
        initialSrc={initialSrc}
        initialDate={initialDate}
        initialQ={initialQ}
      />
    </PortalPage>
  );
}
