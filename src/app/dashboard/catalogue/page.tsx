import { AlertCircle, CheckCircle2, Clock, ExternalLink, Package } from "@/components/icons";
import { StaggerGroup, StaggerItem } from "@/components/motion";
import type { Metadata } from "next";
import { PickClientNotice, Stat } from "@/components/ui";
import { getCatalogWithProducts } from "@/lib/catalog";
import { getCatalogDemandSummary } from "@/lib/catalog-demand";
import { db } from "@/lib/db";
import { fmtNumber } from "@/lib/format";
import { getScope } from "@/lib/session";
import { CatalogueManager } from "./catalogue-manager";
import { PortalPage, T } from "../portal-ui";
import { ProductsPerf } from "./products-perf";
import { ProductsTabs } from "./products-tabs";
import { planGate } from "@/app/dashboard/plan-lock";

export const metadata: Metadata = { title: "Products" };
export const dynamic = "force-dynamic";

export default async function CataloguePage({ searchParams }: PageProps<"/dashboard/catalogue">) {
  const locked = await planGate();
  if (locked) return locked;
  const scope = await getScope();
  if (!scope.clientId) {
    return (
      <PortalPage title="Products" sub="What you sell, and which items need your attention.">
        <ProductsTabs active="cat" />
        <PickClientNotice what="catalogue" />
      </PortalPage>
    );
  }

  const sp = await searchParams;
  const currentView = sp.view === "demand" ? "demand" : "catalogue";

  const [client, { catalogId, products, commerceManagerUrl, isLive, readError }] = await Promise.all([
    db.client.findUnique({
      where: { id: scope.clientId },
      select: { id: true, name: true },
    }),
    getCatalogWithProducts(scope.clientId),
  ]);

  const demandSummary = await getCatalogDemandSummary(scope.clientId, products);

  const total = products.length;
  const inStock = products.filter((p) => p.inStock).length;
  const outOfStock = total - inStock;
  const approved = products.filter((p) => p.whatsappStatus === "APPROVED").length;
  const pending = products.filter((p) => p.whatsappStatus === "PENDING" || p.whatsappStatus === "OUTDATED").length;
  const rejected = products.filter((p) => p.whatsappStatus === "REJECTED").length;

  const notes = [
    readError && "Meta didn't answer just now, so products can't be shown. Refresh the page in a minute.",
    !isLive && !readError && products.length === 0 && "No catalogue connected yet. Create one in Meta Commerce Manager and connect it to this WhatsApp account; its products show here and customers can order them in WhatsApp.",
    !isLive && products.length > 0 && "Showing the portal's saved product list: Meta's live catalogue couldn't be read, so prices and stock may differ from what customers see.",
    isLive && rejected > 0 && `${rejected} product${rejected > 1 ? "s were" : " was"} rejected by Meta and can't be ordered in WhatsApp. Update the details or photo in Commerce Manager.`,
  ].filter(Boolean) as string[];
  const unpaid = currentView === "demand" ? await db.order.aggregate({ where: { clientId: scope.clientId, status: { in: ["NEW", "CONFIRMED"] }, paidAt: null }, _sum: { total: true } }) : null;

  return (
    <PortalPage
      title="Products"
      titleTa="பொருட்கள்"
      sub="What you sell, and which items need your attention."
      subTa="நீங்கள் விற்பவை, கவனிக்க வேண்டிய பொருட்கள்."
      actions={
        commerceManagerUrl ? (
          <a className="btn" href={commerceManagerUrl} target="_blank" rel="noreferrer">
            <ExternalLink aria-hidden className="ic shrink-0" style={{ width: 15, height: 15 }} /> Commerce Manager
          </a>
        ) : undefined
      }
    >
      <ProductsTabs active={currentView === "demand" ? "perf" : "cat"} />

      {notes.map((n) => (
        <div key={n} className="note" style={{ marginBottom: 14 }}>
          <T>{n}</T>
        </div>
      ))}

      {currentView === "demand" ? (
        <ProductsPerf
          products={demandSummary.products}
          nowMs={new Date().getTime()}
          paidSales={demandSummary.totalCatalogRevenue}
          unpaidCarts={unpaid?._sum.total ?? 0}
          cartToPaid={demandSummary.overallCartToPaidRate}
        />
      ) : (
        <>
          <StaggerGroup className="grid g4 keep2" style={{ marginBottom: 16 }}>
            <StaggerItem index={0} className="h-full">
              <Stat
                label="Products"
                value={fmtNumber(total)}
                sub="In the catalogue"
                icon={<Package className="size-4 shrink-0" />}
                tone="info"
              />
            </StaggerItem>
            <StaggerItem index={1} className="h-full">
              <Stat
                label="In stock"
                value={fmtNumber(inStock)}
                sub="Customers can order these"
                icon={<CheckCircle2 className="size-4 shrink-0" />}
                tone="brand"
                meter={total > 0 ? Math.round((inStock / total) * 100) : 0}
              />
            </StaggerItem>
            <StaggerItem index={2} className="h-full">
              <Stat
                label="Out of stock"
                value={fmtNumber(outOfStock)}
                sub="Hidden from new orders"
                icon={<AlertCircle className="size-4 shrink-0" />}
                tone={outOfStock > 0 ? "amber" : "gold"}
              />
            </StaggerItem>
            <StaggerItem index={3} className="h-full">
              <Stat
                label="Waiting for Meta"
                value={fmtNumber(pending)}
                sub="Not in WhatsApp yet"
                icon={<Clock className="size-4 shrink-0" />}
                tone={pending > 0 ? "amber" : "brand"}
              />
            </StaggerItem>
          </StaggerGroup>
          {isLive && (
            <div className="row" style={{ marginBottom: 14, padding: "10px 14px", background: "var(--soft)", borderRadius: 12 }}>
              <span className="live">
                <i />
              </span>
              <div className="grow small">
                <b>
                  {approved} product{approved === 1 ? "" : "s"} live in your WhatsApp catalogue
                </b>
                {pending > 0 && ` · ${pending} waiting for Meta to approve`}
                {catalogId && <span className="muted"> · catalogue {catalogId}</span>}
              </div>
            </div>
          )}
          <CatalogueManager
            products={products}
            catalogId={catalogId}
            commerceManagerUrl={commerceManagerUrl}
            clientName={client?.name ?? "Business"}
            isLive={isLive}
            canManage={scope.canManage}
            demandBySku={demandSummary.demandBySku}
          />
        </>
      )}
    </PortalPage>
  );
}
