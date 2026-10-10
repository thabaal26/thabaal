"use client";

import { Check, CheckCircle2, Copy, Eye, EyeOff, Image as ImageIcon, Loader2, Package, PencilLine, Search, Upload, X, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { Sheet } from "@/components/sheet";
import { toast, toastResult } from "@/components/toast";
import { Badge, Button, Card, EmptyState, Field, Segmented } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { CatalogProductDetail } from "@/lib/catalog";
import { updateProduct, uploadProductImage } from "../actions/catalog";

type StockFilter = "ALL" | "IN_STOCK" | "OUT_OF_STOCK";

export function CatalogueManager({
  products: initialProducts,
  clientName,
}: {
  products: CatalogProductDetail[];
  catalogId: string | null;
  commerceManagerUrl: string | null;
  clientName: string;
  isLive: boolean;
}) {
  const router = useRouter();
  const [products, setProducts] = useState(initialProducts);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("ALL");
  const [stockFilter, setStockFilter] = useState<StockFilter>("ALL");
  const [editing, setEditing] = useState<CatalogProductDetail | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editImageUrl, setEditImageUrl] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = p.name.toLowerCase().includes(q);
        const matchSku = p.retailerId.toLowerCase().includes(q);
        const matchDesc = p.description?.toLowerCase().includes(q);
        if (!matchName && !matchSku && !matchDesc) return false;
      }
      return true;
    });
  }, [products, category, stockFilter, search]);

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

  // Quick 1-click stock toggle
  const handleToggleStock = (product: CatalogProductDetail) => {
    const nextStock = !product.inStock;
    setProducts((prev) =>
      prev.map((p) => (p.id === product.id ? { ...p, inStock: nextStock } : p))
    );

    startTransition(async () => {
      const res = await updateProduct({
        id: product.id,
        retailerId: product.retailerId,
        inStock: nextStock,
      });
      toastResult(res);
      router.refresh();
    });
  };

  // Open edit sheet
  const handleOpenEdit = (item: CatalogProductDetail) => {
    setEditing(item);
    setEditImageUrl(item.imageUrl ?? null);
  };

  // Handle image file upload
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    const formData = new FormData();
    formData.append("file", file);

    const res = await uploadProductImage(formData);
    setUploadingImage(false);

    if (res.ok && res.url) {
      setEditImageUrl(res.url);
      toast(true, "Image uploaded successfully");
    } else {
      toast(false, res.message ?? "Failed to upload image");
    }
  };

  // Save edit sheet
  const handleSaveEdit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editing) return;
    const form = e.currentTarget;
    const price = Number(form.price.value) || 0;
    const inStock = form.inStock.value === "true";
    const name = form.productName.value.trim();
    const description = form.description.value.trim();
    const imageUrl = editImageUrl?.trim() || null;

    setProducts((prev) =>
      prev.map((p) =>
        p.id === editing.id
          ? {
              ...p,
              priceAmount: price,
              price: `₹ ${price.toFixed(2)}`,
              inStock,
              name: name || p.name,
              description,
              imageUrl,
            }
          : p
      )
    );

    const itemToUpdate = editing;
    setEditing(null);

    startTransition(async () => {
      const res = await updateProduct({
        id: itemToUpdate.id,
        retailerId: itemToUpdate.retailerId,
        priceAmount: price,
        inStock,
        name,
        description,
        imageUrl,
      });
      toastResult(res);
      router.refresh();
    });
  };

  const chip = (on: boolean) =>
    cn(
      "inline-flex h-9 items-center whitespace-nowrap rounded-full border px-3 text-xs font-medium transition active:scale-[0.97] sm:h-8 sm:text-[0.8125rem]",
      on ? "border-ink bg-ink text-white" : "border-line-2 bg-panel text-ink-2 hover:border-line-strong hover:bg-subtle hover:text-ink",
    );

  return (
    <div className="space-y-4">
      {/* Toolbar: search, stock and price list on one row; categories under it. */}
      <Card className="space-y-3 p-3 sm:p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <div className="relative min-w-0 flex-1 md:max-w-sm">
            <label htmlFor="catalogue-search" className="sr-only">
              Search products
            </label>
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              id="catalogue-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products or SKU"
              className="field pl-9 pr-10"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-control text-muted hover:bg-sunken hover:text-ink"
              >
                <X aria-hidden className="size-4" />
              </button>
            )}
          </div>
          <Segmented
            label="Stock"
            value={stockFilter}
            onChange={setStockFilter}
            options={[
              { value: "ALL", label: "All" },
              { value: "IN_STOCK", label: "In stock" },
              { value: "OUT_OF_STOCK", label: "Out of stock" },
            ]}
            className="w-full md:w-auto"
          />
          <Button variant="secondary" onClick={() => setPreviewOpen(!previewOpen)} aria-expanded={previewOpen} className="md:ml-auto">
            {previewOpen ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
            {previewOpen ? "Hide price list" : "Price list message"}
          </Button>
        </div>
        {categories.length > 2 && (
          <div role="group" aria-label="Category" className="flex flex-wrap gap-1.5 border-t border-line pt-3">
            {categories.map((c) => (
              <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)} className={chip(category === c)}>
                {c === "ALL" ? "All categories" : c}
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* The automatic price list reply, as WhatsApp will show it. */}
      {previewOpen && (
        <Card className="animate-rise">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
            <div className="min-w-0">
              <h3 className="flex items-center gap-2 text-[0.9375rem] font-semibold text-ink">
                Price list message <Badge tone="brand">Auto-reply</Badge>
              </h3>
              <p className="mt-0.5 text-xs text-muted sm:text-sm">Sent when a customer asks for the price list or rates. Built from in-stock items with a price.</p>
            </div>
            <Button size="sm" variant="secondary" onClick={copyPriceList}>
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copied ? "Copied" : "Copy text"}
            </Button>
          </div>
          <div className="chat-wall p-4 sm:p-5">
            <div className="max-w-md rounded-card rounded-tl-sm bg-bubble p-3.5 shadow-xs">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink">{priceListText}</pre>
            </div>
          </div>
        </Card>
      )}

      <p className="text-sm text-muted" aria-live="polite">
        Showing <span className="tabular font-medium text-ink-2">{filtered.length}</span> of <span className="tabular">{products.length}</span> products
      </p>

      {/* Products Grid */}
      {filtered.length === 0 ? (
        <Card>
          <EmptyState icon={<Package />} title="No products match">
            Try another search, category or stock filter.
          </EmptyState>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((item) => (
            <li key={item.id} className="flex flex-col rounded-card border border-line bg-panel shadow-card transition hover:border-line-2">
              <div className="flex gap-3 p-4">
                <div className={cn("relative size-16 shrink-0 overflow-hidden rounded-control bg-subtle ring-1 ring-line", !item.inStock && "opacity-60 grayscale")}>
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <div className="grid size-full place-items-center text-faint">
                      <Package aria-hidden className="size-6" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-ink">{item.name}</h4>
                  <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted">
                    <span className="truncate">{item.category || "Uncategorised"}</span>
                    <span aria-hidden>·</span>
                    <span className="shrink-0 font-mono">{item.retailerId}</span>
                  </p>
                </div>
              </div>
              <p className="line-clamp-2 min-h-[2lh] px-4 text-xs leading-relaxed text-muted">{item.description}</p>
              <div className="mt-auto flex items-center justify-between gap-2 px-4 pb-3 pt-3">
                <span className="tabular text-lg font-semibold text-ink">₹{item.priceAmount.toLocaleString("en-IN")}</span>
                <Badge tone={item.inStock ? "green" : "amber"} dot>
                  {item.inStock ? "In stock" : "Out of stock"}
                </Badge>
              </div>
              <div className="flex gap-2 border-t border-line p-3">
                <Button variant="secondary" size="sm" onClick={() => handleToggleStock(item)} disabled={pending} className="flex-1">
                  {item.inStock ? <XCircle aria-hidden /> : <CheckCircle2 aria-hidden />}
                  {item.inStock ? "Mark out of stock" : "Mark in stock"}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => handleOpenEdit(item)} aria-label={`Edit ${item.name}`}>
                  <PencilLine aria-hidden /> Edit
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Sheet
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Edit product"
        description={editing ? <>SKU <span className="font-mono">{editing.retailerId}</span></> : undefined}
        className="sm:max-w-lg"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" form="edit-product" loading={pending || uploadingImage}>
              Save product
            </Button>
          </div>
        }
      >
        {editing && (
          <form id="edit-product" onSubmit={handleSaveEdit} className="space-y-4">
            <div>
              <p className="mb-1.5 text-sm font-medium text-ink">Photo</p>
              <div className="flex items-center gap-4 rounded-control border border-line bg-subtle p-3">
                <div className="relative size-20 shrink-0 overflow-hidden rounded-control bg-panel ring-1 ring-line">
                  {editImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={editImageUrl} alt="Product photo preview" className="size-full object-cover" />
                  ) : (
                    <div className="grid size-full place-items-center text-faint">
                      <ImageIcon aria-hidden className="size-7" />
                    </div>
                  )}
                  {uploadingImage && (
                    <div className="absolute inset-0 grid place-items-center bg-night/50 text-white">
                      <Loader2 aria-hidden className="size-5 animate-spin" />
                      <span className="sr-only">Uploading</span>
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/jpg" onChange={handleImageUpload} className="hidden" />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="secondary" size="sm" disabled={uploadingImage} onClick={() => fileInputRef.current?.click()}>
                      {uploadingImage ? <Loader2 aria-hidden className="animate-spin" /> : <Upload aria-hidden />}
                      {uploadingImage ? "Uploading…" : editImageUrl ? "Replace photo" : "Upload photo"}
                    </Button>
                    {editImageUrl && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setEditImageUrl(null)} className="text-danger hover:text-danger">
                        Remove
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted">JPG, PNG or WebP, under 5 MB.</p>
                </div>
              </div>
              <label htmlFor="product-image-url" className="sr-only">
                Image URL
              </label>
              <input
                id="product-image-url"
                type="url"
                placeholder="Or paste an image URL (https://…)"
                value={editImageUrl ?? ""}
                onChange={(e) => setEditImageUrl(e.target.value)}
                className="field mt-2"
              />
            </div>

            <Field id="productName" label="Product name" required>
              <input name="productName" defaultValue={editing.name} className="field" />
            </Field>

            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
              <Field id="price" label="Price" hint="₹ INR" required>
                <input name="price" type="number" inputMode="decimal" step="1" min="0" defaultValue={editing.priceAmount} className="field tabular" />
              </Field>
              <Field id="inStock" label="Stock">
                <select name="inStock" defaultValue={editing.inStock ? "true" : "false"} className="field">
                  <option value="true">In stock</option>
                  <option value="false">Out of stock</option>
                </select>
              </Field>
            </div>

            <Field id="description" label="Description" hint="optional">
              <textarea name="description" defaultValue={editing.description ?? ""} rows={3} className="field" placeholder="E.g. Sulphur free, 100% cold pressed" />
            </Field>

            <p className="rounded-control bg-subtle p-3 text-xs text-muted">
              Saved in the portal first. When WhatsApp is connected to Meta&apos;s catalogue the change is sent there too; the confirmation tells you which happened.
            </p>
          </form>
        )}
      </Sheet>
    </div>
  );
}
