"use client";

import { Image as ImageIcon, Loader2, Package, Plus, Search, Trash2, Upload } from "@/components/icons";
import Link from "@/components/intent-link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { confirmAction } from "@/components/confirm";
import { Sheet } from "@/components/sheet";
import { toast, toastResult } from "@/components/toast";
import { Badge, Button, Field } from "@/components/ui";
import type { CatalogProductDetail } from "@/lib/catalog";
import type { ProductDemandStats } from "@/lib/catalog-demand";
import { createProduct, deleteProduct, updateProduct, uploadProductImage } from "../actions/catalog";

type StockFilter = "ALL" | "IN_STOCK" | "OUT_OF_STOCK";
type StatusFilter = "ALL" | "APPROVED" | "REVIEW" | "REJECTED";

/** The next free SKU in the catalogue's own pattern, e.g. SKU-021 → SKU-022. */
function nextSku(products: CatalogProductDetail[]) {
  let best: { prefix: string; n: number; width: number } | null = null;
  for (const p of products) {
    const m = /^(.*?)(\d+)$/.exec(p.retailerId);
    if (!m || m[2].length > 6) continue;
    const n = Number(m[2]);
    if (!best || n > best.n) best = { prefix: m[1], n, width: m[2].length };
  }
  return best ? `${best.prefix}${String(best.n + 1).padStart(best.width, "0")}` : "SKU-001";
}

/** Photo picker shared by the add and edit sheets: upload to storage or paste a public link. */
function PhotoField({ value, onChange, removable }: { value: string | null; onChange: (url: string | null) => void; removable: boolean }) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    const res = await uploadProductImage(formData);
    setUploading(false);
    if (res.ok && res.url) {
      onChange(res.url);
      toast(true, "Photo uploaded. Save to apply it.");
    } else toast(false, res.message ?? "Couldn't upload the photo.");
  };

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-ink">Photo</p>
      <div className="flex items-center gap-4 rounded-control border border-line bg-subtle p-3">
        <div className="relative size-20 shrink-0 overflow-hidden rounded-control bg-panel ring-1 ring-line">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="Product photo preview" className="size-full object-cover" />
          ) : (
            <div className="grid size-full place-items-center text-faint">
              <ImageIcon aria-hidden className="size-7" />
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 grid place-items-center bg-night/50 text-white">
              <Loader2 aria-hidden className="size-5 animate-spin" />
              <span className="sr-only">Uploading</span>
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={upload} className="hidden" />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
              {uploading ? <Loader2 aria-hidden className="animate-spin" /> : <Upload aria-hidden />}
              {uploading ? "Uploading…" : value ? "Replace photo" : "Upload photo"}
            </Button>
            {value && removable && (
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)} className="text-danger hover:text-danger">
                Remove
              </Button>
            )}
          </div>
          <p className="text-xs text-muted">JPG, PNG or WebP, under 4 MB. Square photos look best in WhatsApp.</p>
        </div>
      </div>
      <label htmlFor="product-image-url" className="sr-only">
        Image link
      </label>
      <input
        id="product-image-url"
        type="url"
        placeholder="Or paste a public image link (https://…)"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="field mt-2"
      />
    </div>
  );
}

export function CatalogueManager({
  products: initialProducts,
  clientName,
  isLive,
  canManage,
  demandBySku = {},
}: {
  products: CatalogProductDetail[];
  catalogId: string | null;
  commerceManagerUrl: string | null;
  clientName: string;
  isLive: boolean;
  canManage: boolean;
  demandBySku?: Record<string, ProductDemandStats>;
}) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  // Fresh data from the server (after a save and refresh) replaces local, optimistic state.
  const [serverProducts, setServerProducts] = useState(initialProducts);
  if (serverProducts !== initialProducts) {
    setServerProducts(initialProducts);
    setProducts(initialProducts);
  }
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("ALL");
  const [stockFilter, setStockFilter] = useState<StockFilter>("ALL");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [cartFilter, setCartFilter] = useState<"ALL" | "IN_CARTS">("ALL");
  const [editing, setEditing] = useState<CatalogProductDetail | null>(null);
  const [adding, setAdding] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editImageUrl, setEditImageUrl] = useState<string | null>(null);
  const [addImageUrl, setAddImageUrl] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [, startToggle] = useTransition();

  // Number of products currently present in customer WhatsApp carts
  const inCartsCount = useMemo(
    () => products.filter((p) => (demandBySku[p.retailerId]?.cartCount ?? 0) > 0).length,
    [products, demandBySku],
  );

  // Categories list
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return ["ALL", ...Array.from(set)];
  }, [products]);

  // Filtered products
  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (category !== "ALL" && p.category !== category) return false;
      if (stockFilter === "IN_STOCK" && !p.inStock) return false;
      if (stockFilter === "OUT_OF_STOCK" && p.inStock) return false;
      if (statusFilter === "APPROVED" && p.whatsappStatus !== "APPROVED") return false;
      if (statusFilter === "REVIEW" && p.whatsappStatus !== "PENDING" && p.whatsappStatus !== "OUTDATED") return false;
      if (statusFilter === "REJECTED" && p.whatsappStatus !== "REJECTED") return false;
      if (cartFilter === "IN_CARTS" && (!demandBySku[p.retailerId] || demandBySku[p.retailerId].cartCount === 0)) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = p.name.toLowerCase().includes(q);
        const matchSku = p.retailerId.toLowerCase().includes(q);
        const matchDesc = p.description?.toLowerCase().includes(q);
        if (!matchName && !matchSku && !matchDesc) return false;
      }
      return true;
    });
  }, [products, category, stockFilter, statusFilter, cartFilter, search, demandBySku]);

  // Live WhatsApp price list text preview
  const priceListText = useMemo(() => {
    const active = products.filter((p) => p.inStock && p.priceAmount > 0);
    const groups: Record<string, CatalogProductDetail[]> = {};
    active.forEach((p) => {
      const cat = p.category || "General";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    });

    const lines: string[] = [
      `🛒 *${clientName} – Price List*`,
      `விலைப் பட்டியல்\n`,
    ];

    Object.entries(groups).forEach(([cat, items]) => {
      lines.push(`*${cat}*`);
      items.forEach((item) => {
        lines.push(`• ${item.name} – ₹${item.priceAmount}`);
      });
      lines.push("");
    });

    lines.push(`Tap *View catalog* below to order 👇`);
    return lines.join("\n");
  }, [products, clientName]);

  const copyPriceList = async () => {
    try {
      await navigator.clipboard.writeText(priceListText);
      setCopied(true);
      toast(true, "Price list copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast(false, "Couldn't copy. Select the text and copy it instead.");
    }
  };

  // One-tap stock toggle: shown at once, put back if Meta refuses it.
  const handleToggleStock = (product: CatalogProductDetail) => {
    const nextStock = !product.inStock;
    const setStock = (inStock: boolean) => setProducts((prev) => prev.map((p) => (p.id === product.id ? { ...p, inStock } : p)));
    setStock(nextStock);
    setTogglingId(product.id);

    startToggle(async () => {
      const res = await updateProduct({ id: product.id, retailerId: product.retailerId, inStock: nextStock });
      if (!res.ok) setStock(product.inStock);
      setTogglingId(null);
      toastResult(res);
      router.refresh();
    });
  };

  const handleOpenEdit = (item: CatalogProductDetail) => {
    setEditing(item);
    setEditImageUrl(item.imageUrl ?? null);
  };

  // Saving waits for Meta's answer: the sheet only closes once the change is accepted.
  const handleSaveEdit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editing) return;
    const form = e.currentTarget;
    const price = Number(form.price.value) || 0;
    const inStock = form.inStock.value === "true";
    const name = form.productName.value.trim();
    const description = form.description.value.trim();
    const imageUrl = editImageUrl?.trim() || null;
    const item = editing;
    // Only a photo the user changed is sent: the current one is Meta's own (CDN) copy.
    const photoChanged = imageUrl !== (item.imageUrl ?? null);

    startSave(async () => {
      const res = await updateProduct({ id: item.id, retailerId: item.retailerId, priceAmount: price, inStock, name, description, ...(photoChanged && { imageUrl }) });
      toastResult(res);
      if (!res.ok) return;
      setProducts((prev) =>
        prev.map((p) => (p.id === item.id ? { ...p, priceAmount: price, price: `₹ ${price.toFixed(2)}`, inStock, name: name || p.name, description, imageUrl: imageUrl ?? p.imageUrl } : p)),
      );
      setEditing(null);
      router.refresh();
    });
  };

  const handleDelete = async () => {
    if (!editing) return;
    const item = editing;
    const yes = await confirmAction({
      title: `Delete ${item.name}?`,
      message: `It will be removed from your WhatsApp catalogue (${item.retailerId}) and customers can no longer order it. Past orders keep their details.`,
      confirmLabel: "Delete product",
      danger: true,
    });
    if (!yes) return;
    startSave(async () => {
      const res = await deleteProduct(item.retailerId);
      toastResult(res);
      if (!res.ok) return;
      setProducts((prev) => prev.filter((p) => p.id !== item.id));
      setEditing(null);
      router.refresh();
    });
  };

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = {
      retailerId: form.sku.value.trim(),
      name: form.newName.value.trim(),
      priceAmount: Number(form.newPrice.value) || 0,
      inStock: form.newStock.value === "true",
      description: form.newDescription.value.trim(),
      imageUrl: addImageUrl?.trim() || null,
    };
    startSave(async () => {
      const res = await createProduct(data);
      toastResult(res);
      if (!res.ok) return;
      setAdding(false);
      setAddImageUrl(null);
      router.refresh();
    });
  };

  const canAdd = canManage && isLive;
  const pillFor = (st: CatalogProductDetail["whatsappStatus"]) =>
    !isLive
      ? { tone: "mute", label: "Saved copy" }
      : st === "APPROVED"
        ? { tone: "ok", label: "Synced" }
        : st === "REJECTED"
          ? { tone: "bad", label: "Rejected by Meta" }
          : st === "PENDING" || st === "OUTDATED"
            ? { tone: "warn", label: "Waiting for Meta" }
            : { tone: "mute", label: "Not synced" };

  return (
    <div>
      <div className="toolbar">
        <div className="search">
          <Search aria-hidden />
          <input type="search" placeholder="Search products" aria-label="Search products" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="chips">
          {(
            [
              ["ALL", "All"],
              ["IN_STOCK", "In stock"],
              ["OUT_OF_STOCK", "Out of stock"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" className="chip" aria-pressed={stockFilter === k} onClick={() => setStockFilter(k)}>
              {label}
            </button>
          ))}
          {inCartsCount > 0 && (
            <button type="button" className="chip" aria-pressed={cartFilter === "IN_CARTS"} onClick={() => setCartFilter(cartFilter === "IN_CARTS" ? "ALL" : "IN_CARTS")}>
              In carts <small>{inCartsCount}</small>
            </button>
          )}
        </div>
        {categories.length > 2 && (
          <select aria-label="Category" style={{ width: "auto" }} value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === "ALL" ? "Category: all" : c}
              </option>
            ))}
          </select>
        )}
        {isLive && (
          <select aria-label="WhatsApp status" style={{ width: "auto" }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
            <option value="ALL">WhatsApp: all</option>
            <option value="APPROVED">Synced to catalogue</option>
            <option value="REVIEW">Waiting for Meta</option>
            <option value="REJECTED">Rejected by Meta</option>
          </select>
        )}
        <div className="tools" style={{ marginLeft: "auto" }}>
          <button type="button" className="btn sm" aria-expanded={previewOpen} onClick={() => setPreviewOpen(!previewOpen)}>
            {previewOpen ? "Hide price list" : "Price list message"}
          </button>
          {canAdd && (
            <button type="button" className="btn sm primary" onClick={() => setAdding(true)}>
              <Plus aria-hidden className="ic" style={{ width: 15, height: 15 }} /> Add product
            </button>
          )}
        </div>
      </div>

      {previewOpen && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="hd">
            <div>
              <h2>Price list message</h2>
              <p>In-stock products with a price. Paste it in a chat; customers get your catalogue with “View catalog”.</p>
            </div>
            <button type="button" className="btn sm" onClick={copyPriceList}>
              {copied ? "Copied" : "Copy text"}
            </button>
          </div>
          <div className="phone">
            <div className="bubble">{priceListText}</div>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th className="num">Price</th>
                <th>WhatsApp</th>
                <th>In stock</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const pill = pillFor(item.whatsappStatus);
                const d = demandBySku[item.retailerId];
                return (
                  <tr key={item.id}>
                    <td>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        {item.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- Meta's product photo
                          <img src={item.imageUrl} alt="" width={40} height={40} style={{ width: 40, height: 40, borderRadius: 10, objectFit: "cover", flex: "none" }} />
                        ) : (
                          <span className="note" style={{ width: 40, height: 40, padding: 0, display: "grid", placeItems: "center", flex: "none" }}>
                            <Package aria-hidden className="ic" style={{ width: 16, height: 16 }} />
                          </span>
                        )}
                        <div>
                          <b>{item.name}</b>
                          <div className="muted small">
                            {item.retailerId}
                            {d && d.cartCount > 0 && ` · in ${d.cartCount} cart${d.cartCount === 1 ? "" : "s"}`}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>{item.category || "—"}</td>
                    <td className="num">{item.priceAmount > 0 ? `₹${item.priceAmount.toLocaleString("en-IN")}` : <span className="muted">No price</span>}</td>
                    <td>
                      <span className={`pill ${pill.tone}`}>{pill.label}</span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="sw"
                        role="switch"
                        aria-checked={item.inStock}
                        aria-label={`In stock: ${item.name}`}
                        disabled={!canManage || togglingId !== null || !isLive}
                        onClick={() => handleToggleStock(item)}
                        style={togglingId === item.id ? { opacity: 0.6 } : undefined}
                      />
                    </td>
                    <td>
                      <div className="tools">
                        {canManage && isLive && (
                          <button type="button" className="btn sm" onClick={() => handleOpenEdit(item)} aria-label={`Edit ${item.name}`}>
                            Edit
                          </button>
                        )}
                        <Link className="btn sm ghost" href="/dashboard/campaigns/new">
                          Make a campaign
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <p className="muted" style={{ padding: 16 }}>
            {products.length ? "No products match." : "No products yet."}
          </p>
        )}
      </div>

      <Sheet
        open={!!editing}
        onClose={() => !saving && setEditing(null)}
        title="Edit product"
        description={editing ? <>SKU <span className="font-mono">{editing.retailerId}</span></> : undefined}
        className="sm:max-w-lg"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            {canManage && isLive && (
              <Button type="button" variant="ghost" onClick={handleDelete} disabled={saving} className="text-danger hover:bg-danger-bg hover:text-danger sm:mr-auto">
                <Trash2 aria-hidden /> Delete
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={() => setEditing(null)} disabled={saving} className="sm:ml-auto">
              Cancel
            </Button>
            <Button type="submit" form="edit-product" loading={saving}>
              Save product
            </Button>
          </div>
        }
      >
        {editing && (
          <form id="edit-product" onSubmit={handleSaveEdit} className="space-y-4">
            {isLive && editing.whatsappStatus && (
              <div className="flex items-center justify-between rounded-control border border-line bg-subtle p-3 text-xs">
                <span className="font-medium text-ink">Meta WhatsApp Review:</span>
                {editing.whatsappStatus === "APPROVED" ? (
                  <Badge tone="green" dot>
                    Approved & Live on WhatsApp
                  </Badge>
                ) : editing.whatsappStatus === "REJECTED" ? (
                  <Badge tone="red" dot>
                    Rejected by Meta Policy
                  </Badge>
                ) : (
                  <Badge tone="amber" dot>
                    Under Review by Meta
                  </Badge>
                )}
              </div>
            )}
            <PhotoField value={editImageUrl} onChange={setEditImageUrl} removable={!isLive} />

            <Field id="productName" label="Product name" required>
              <input name="productName" defaultValue={editing.name} maxLength={100} className="field" />
            </Field>

            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
              <Field id="price" label="Price" hint="₹ INR" required>
                <input name="price" type="number" inputMode="decimal" step="0.01" min="1" defaultValue={editing.priceAmount} className="field tabular" />
              </Field>
              <Field id="inStock" label="Stock">
                <select name="inStock" defaultValue={editing.inStock ? "true" : "false"} className="field">
                  <option value="true">In stock</option>
                  <option value="false">Out of stock</option>
                </select>
              </Field>
            </div>

            <Field id="description" label="Description" hint="optional">
              <textarea name="description" defaultValue={editing.description ?? ""} rows={3} maxLength={5000} className="field" placeholder="E.g. Sulphur free, 100% cold pressed" />
            </Field>

            <p className="rounded-control bg-subtle p-3 text-xs text-muted">
              {isLive
                ? "Saving updates this product in your WhatsApp catalogue on Meta. It can take a minute before customers see the change."
                : "Demo mode: changes are kept in the portal only, because the WhatsApp Cloud API isn't connected."}
            </p>
          </form>
        )}
      </Sheet>

      {/* Add */}
      <Sheet
        open={adding}
        onClose={() => !saving && setAdding(false)}
        title="Add product"
        description="It appears in your WhatsApp catalogue for customers to order."
        className="sm:max-w-lg"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setAdding(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="add-product" loading={saving}>
              Add product
            </Button>
          </div>
        }
      >
        {adding && (
          <form id="add-product" onSubmit={handleCreate} className="space-y-4">
            <PhotoField value={addImageUrl} onChange={setAddImageUrl} removable />
            <Field id="newName" label="Product name" required>
              <input name="newName" maxLength={100} className="field" placeholder="E.g. Basmati rice 5kg" />
            </Field>
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
              <Field id="sku" label="SKU" hint="unique code" required>
                <input name="sku" defaultValue={nextSku(products)} maxLength={50} pattern="[\w.\-]{1,50}" className="field font-mono" />
              </Field>
              <Field id="newPrice" label="Price" hint="₹ INR" required>
                <input name="newPrice" type="number" inputMode="decimal" step="0.01" min="1" className="field tabular" />
              </Field>
            </div>
            <Field id="newStock" label="Stock">
              <select name="newStock" defaultValue="true" className="field">
                <option value="true">In stock</option>
                <option value="false">Out of stock</option>
              </select>
            </Field>
            <Field id="newDescription" label="Description" hint="optional">
              <textarea name="newDescription" rows={3} maxLength={5000} className="field" placeholder="What makes it special" />
            </Field>
          </form>
        )}
      </Sheet>
    </div>
  );
}
