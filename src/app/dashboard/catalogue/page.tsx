import { CheckCircle2, ExternalLink, Package, ShoppingBag, Store, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, buttonClass, Card, PageHeader, PickClientNotice } from "@/components/ui";
import { getCatalogWithProducts } from "@/lib/catalog";
import { db } from "@/lib/db";
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
    select: { id: true, name: true, waBusinessAccountId: true },
  });

  const { catalogId, products, commerceManagerUrl, isLive } = await getCatalogWithProducts(scope.clientId);

  const total = products.length;
  const inStock = products.filter((p) => p.inStock).length;
  const outOfStock = total - inStock;

  return (
    <>
      <PageHeader
        title="Catalogue & Menu"
        description="Manage your WhatsApp product items, menu prices, and stock availability. Changes sync directly to customer WhatsApp chats and incoming orders."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/dashboard/orders" className={buttonClass("secondary")}>
              <ShoppingBag aria-hidden className="size-4" /> View Orders
            </Link>
            {commerceManagerUrl && (
              <a
                href={commerceManagerUrl}
                target="_blank"
                rel="noreferrer"
                className={buttonClass("primary")}
              >
                <ExternalLink aria-hidden className="size-4" /> Meta Commerce Manager
              </a>
            )}
          </div>
        }
      />

      {/* Stats row */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <Card className="p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted">Total Products</span>
            <Store className="size-4 text-muted opacity-70" />
          </div>
          <p className="mt-2 text-2xl font-bold tabular text-ink">{total}</p>
          <p className="text-3xs text-muted mt-0.5">Active in catalogue</p>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted">In Stock</span>
            <CheckCircle2 className="size-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-bold tabular text-emerald-600">{inStock}</p>
          <p className="text-3xs text-muted mt-0.5">Available to order</p>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted">Out of Stock</span>
            <XCircle className="size-4 text-amber-500" />
          </div>
          <p className="mt-2 text-2xl font-bold tabular text-amber-600">{outOfStock}</p>
          <p className="text-3xs text-muted mt-0.5">Hidden from orders</p>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted">Meta Catalog Sync</span>
            <Badge tone={isLive ? "green" : "gray"} dot>
              {isLive ? "Live" : "Local"}
            </Badge>
          </div>
          <p className="mt-2 truncate font-mono text-xs font-medium text-ink">
            {catalogId ? `ID: ${catalogId}` : "Connected"}
          </p>
          <p className="text-3xs text-muted mt-0.5">WhatsApp Cloud API</p>
        </Card>
      </div>

      <CatalogueManager
        products={products}
        catalogId={catalogId}
        commerceManagerUrl={commerceManagerUrl}
        clientName={client?.name ?? "Business"}
        isLive={isLive}
      />
    </>
  );
}
