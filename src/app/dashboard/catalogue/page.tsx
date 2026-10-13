import { CheckCircle2, CloudOff, ExternalLink, ShoppingBag, XCircle } from "@/components/icons";
import type { Metadata } from "next";
import Link from "@/components/intent-link";
import { ShoppingBag3D, Store3D } from "@/components/icons-3d";
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

  const [client, { catalogId, products, commerceManagerUrl, isLive, readError }] = await Promise.all([
    db.client.findUnique({
      where: { id: scope.clientId },
      select: { id: true, name: true },
    }),
    getCatalogWithProducts(scope.clientId),
  ]);

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
            <Link href="/dashboard/catalogue/combos" className={buttonClass("secondary")}>
              Combo ideas
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

      {readError && (
        <Callout tone="warning" icon={<CloudOff />} title="Couldn't reach Meta's catalogue" className="mb-4">
          Meta didn&apos;t answer just now, so products can&apos;t be shown. Refresh the page in a minute.
        </Callout>
      )}
      {!isLive && !readError && products.length === 0 && (
        <Callout tone="info" icon={<CloudOff />} title="No catalogue connected yet" className="mb-4">
          Create a catalogue in Meta Commerce Manager and connect it to this WhatsApp account. Its products will show here, and customers can order from them
          in WhatsApp.
        </Callout>
      )}
      {!isLive && products.length > 0 && (
        <Callout tone="info" icon={<CloudOff />} title="Showing the portal's saved product list" className="mb-4">
          Meta&apos;s live catalogue couldn&apos;t be read for this WhatsApp account, so prices and stock here may differ from what customers see in WhatsApp.
        </Callout>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Products" value={fmtNumber(total)} sub="In the catalogue" icon={<Store3D />} tone="info" />
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
          icon={<ShoppingBag3D />}
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
