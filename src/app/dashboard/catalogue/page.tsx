import { CheckCircle2, CloudOff, ExternalLink, PackageCheck, PackageX, ShoppingBag, Tag } from "@/components/icons";
import type { Metadata } from "next";
import Link from "@/components/intent-link";
import { Badge, buttonClass, Callout, PageHeader, PickClientNotice, Stat } from "@/components/ui";
import { getCatalogWithProducts } from "@/lib/catalog";
import { getCatalogDemandSummary } from "@/lib/catalog-demand";
import { db } from "@/lib/db";
import { fmtNumber } from "@/lib/format";
import { getScope } from "@/lib/session";
import { CatalogueManager } from "./catalogue-manager";
import { DemandLeaderboard } from "./demand-leaderboard";

export const metadata: Metadata = { title: "Products" };
export const dynamic = "force-dynamic";

export default async function CataloguePage() {
  const scope = await getScope();
  if (!scope.clientId) {
    return (
      <>
        <PageHeader title="Catalogue & Menu" />
        <PickClientNotice what="catalogue" />
      </>
    );
  }

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

  return (
    <>
      <PageHeader
        title="Products"
        description="What you sell, and which items need your attention."
        rowActions
        actions={
          <>
            <Link href="/dashboard/orders" className={buttonClass("secondary")}>
              <ShoppingBag aria-hidden className="size-4 stroke-[2]" /> Orders
            </Link>
            <Link href="/dashboard/catalogue/combos" className={buttonClass("secondary")}>
              Combo ideas
            </Link>
            {commerceManagerUrl && (
              <a href={commerceManagerUrl} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
                <ExternalLink aria-hidden className="size-4 stroke-[2]" /> Commerce Manager
                <span className="sr-only">(opens Meta)</span>
              </a>
            )}
          </>
        }
        tabs={
          <nav aria-label="Product sub-views" className="inline-flex rounded-xl border border-line bg-card p-1 shadow-2xs">
            <a
              href="#catalogue-items"
              className="inline-flex min-h-[32px] items-center rounded-lg px-3 text-[13.5px] font-semibold bg-ink text-canvas shadow-xs"
            >
              Catalogue
            </a>
            <a
              href="#demand-leaderboard"
              className="inline-flex min-h-[32px] items-center rounded-lg px-3 text-[13.5px] font-semibold text-muted hover:text-ink transition"
            >
              How products sell
            </a>
          </nav>
        }
      />

      {readError && (
        <Callout tone="warning" icon={<CloudOff className="size-4 stroke-[2]" />} title="Couldn't reach Meta's catalogue" className="mb-4">
          Meta didn&apos;t answer just now, so products can&apos;t be shown. Refresh the page in a minute.
        </Callout>
      )}
      {!isLive && !readError && products.length === 0 && (
        <Callout tone="info" icon={<CloudOff className="size-4 stroke-[2]" />} title="No catalogue connected yet" className="mb-4">
          Create a catalogue in Meta Commerce Manager and connect it to this WhatsApp account. Its products will show here, and customers can order from them
          in WhatsApp.
        </Callout>
      )}
      {!isLive && products.length > 0 && (
        <Callout tone="info" icon={<CloudOff className="size-4 stroke-[2]" />} title="Showing the portal's saved product list" className="mb-4">
          Meta&apos;s live catalogue couldn&apos;t be read for this WhatsApp account, so prices and stock here may differ from what customers see in WhatsApp.
        </Callout>
      )}
      {isLive && pending > 0 && (
        <Callout tone="warning" title={`${pending} product${pending > 1 ? "s" : ""} in Meta review`} className="mb-4">
          Meta is currently reviewing {pending > 1 ? "these products" : "this product"}. Once approved, {pending > 1 ? "they" : "it"} will automatically show in your WhatsApp catalogue.
        </Callout>
      )}
      {isLive && rejected > 0 && (
        <Callout tone="danger" title={`${rejected} product${rejected > 1 ? "s" : ""} rejected by Meta`} className="mb-4">
          {rejected > 1 ? "These products were" : "This product was"} rejected under Meta Commerce policy and cannot be ordered in WhatsApp. Update details or photo in Meta Commerce Manager.
        </Callout>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Products" value={fmtNumber(total)} sub="In the catalogue" icon={<Tag className="size-5 stroke-[2]" />} tone="info" />
        <Stat
          label="In stock"
          value={fmtNumber(inStock)}
          sub="Customers can order these"
          icon={<PackageCheck className="size-5 stroke-[2]" />}
          tone="brand"
          meter={total > 0 ? Math.round((inStock / total) * 100) : 0}
        />
        <Stat
          label="Out of stock"
          value={fmtNumber(outOfStock)}
          sub="Hidden from new orders"
          icon={<PackageX className="size-5 stroke-[2]" />}
          tone={outOfStock > 0 ? "amber" : "gold"}
        />
        <Stat
          label="WhatsApp status"
          tone={isLive ? (rejected > 0 ? "amber" : pending > 0 ? "amber" : "brand") : "violet"}
          icon={<ShoppingBag className="size-5 stroke-[2]" />}
          value={
            <Badge
              tone={isLive ? (rejected > 0 ? "red" : pending > 0 ? "amber" : "green") : "gray"}
              dot
              className="text-sm"
            >
              {isLive ? `${approved} / ${total} Approved` : "Saved copy"}
            </Badge>
          }
          sub={
            isLive
              ? pending > 0
                ? `${pending} pending review`
                : rejected > 0
                  ? `${rejected} rejected`
                  : "All 25 live on WhatsApp"
              : catalogId
                ? <span className="font-mono">ID {catalogId}</span>
                : "No catalogue linked"
          }
        />
      </div>
 
      <DemandLeaderboard summary={demandSummary} commerceManagerUrl={commerceManagerUrl} />

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
  );
}
