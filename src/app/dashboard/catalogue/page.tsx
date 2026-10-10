import { CheckCircle2, CloudOff, ExternalLink, Package, ShoppingBag, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, buttonClass, Callout, PageHeader, PickClientNotice, Stat } from "@/components/ui";
import { getCatalogWithProducts } from "@/lib/catalog";
import { db } from "@/lib/db";
import { fmtNumber } from "@/lib/format";
import { getScope } from "@/lib/session";
import { CatalogueManager } from "./catalogue-manager";

export const metadata: Metadata = { title: "Catalogue & Menu" };
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

  const client = await db.client.findUnique({
    where: { id: scope.clientId },
    select: { id: true, name: true },
  });

  const { catalogId, products, commerceManagerUrl, isLive } = await getCatalogWithProducts(scope.clientId);

  const total = products.length;
  const inStock = products.filter((p) => p.inStock).length;
  const outOfStock = total - inStock;

  return (
    <>
      <PageHeader
        title="Catalogue & Menu"
        description="Products, prices and stock that customers see when they tap View catalog in WhatsApp."
        rowActions
        actions={
          <>
            <Link href="/dashboard/orders" className={buttonClass("secondary")}>
              <ShoppingBag aria-hidden className="size-4" /> Orders
            </Link>
            {commerceManagerUrl && (
              <a href={commerceManagerUrl} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
                <ExternalLink aria-hidden className="size-4" /> Commerce Manager
                <span className="sr-only">(opens Meta)</span>
              </a>
            )}
          </>
        }
      />

      {!isLive && (
        <Callout tone="info" icon={<CloudOff />} title="Showing the portal's saved product list" className="mb-4">
          Meta&apos;s live catalogue couldn&apos;t be read for this WhatsApp account, so prices and stock here may differ from what customers see in WhatsApp.
        </Callout>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Products" value={fmtNumber(total)} sub="In the catalogue" icon={<Package className="size-4" />} tone="info" />
        <Stat
          label="In stock"
          value={fmtNumber(inStock)}
          sub="Customers can order these"
          icon={<CheckCircle2 className="size-4" />}
          tone="brand"
          meter={total > 0 ? Math.round((inStock / total) * 100) : 0}
        />
        <Stat
          label="Out of stock"
          value={fmtNumber(outOfStock)}
          sub="Hidden from new orders"
          icon={<XCircle className="size-4" />}
          tone={outOfStock > 0 ? "amber" : "gold"}
        />
        <Stat
          label="Meta catalogue"
          tone="violet"
          icon={<ShoppingBag className="size-4" />}
          value={
            <Badge tone={isLive ? "green" : "gray"} dot className="text-sm">
              {isLive ? "Live sync" : "Saved copy"}
            </Badge>
          }
          sub={catalogId ? <span className="font-mono">ID {catalogId}</span> : "No catalogue linked"}
        />
      </div>

      <CatalogueManager
        products={products}
        catalogId={catalogId}
        commerceManagerUrl={commerceManagerUrl}
        clientName={client?.name ?? "Business"}
        isLive={isLive}
        canManage={scope.canManage}
      />
    </>
  );
}
