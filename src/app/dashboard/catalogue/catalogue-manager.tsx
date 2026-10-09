"use client";

import {
  Camera,
  Check,
  CheckCircle2,
  Copy,
  Edit2,
  ExternalLink,
  Eye,
  Filter,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Package,
  RefreshCw,
  Search,
  Sparkles,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { toast, toastResult } from "@/components/toast";
import { Badge, Button, Card, Field } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { CatalogProductDetail } from "@/lib/catalog";
import { updateProduct, uploadProductImage } from "../actions/catalog";

export function CatalogueManager({
  products: initialProducts,
  catalogId,
  commerceManagerUrl,
  clientName,
  isLive,
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
  const [stockFilter, setStockFilter] = useState<"ALL" | "IN_STOCK" | "OUT_OF_STOCK">("ALL");
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

  const copyPriceList = () => {
    navigator.clipboard.writeText(priceListText);
    setCopied(true);
    toast(true, "Price list copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
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

  // Open edit modal
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

  // Save edit modal
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

  return (
    <div className="space-y-6">
      {/* Top Controls: Search, Categories, Previews */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search catalogue items or SKU..."
            className="field pl-9 pr-4 text-sm"
          />
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setPreviewOpen(!previewOpen)}
            className="text-xs"
          >
            <Eye className="size-3.5" />
            {previewOpen ? "Hide Price List" : "Preview WhatsApp Price List"}
          </Button>

          {commerceManagerUrl && (
            <a
              href={commerceManagerUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-control border border-line bg-panel px-3 text-xs font-medium text-ink shadow-subtle hover:bg-hover hover:text-ink active:bg-sunken"
            >
              <ExternalLink className="size-3.5 text-muted" />
              Meta Commerce Manager
            </a>
          )}
        </div>
      </div>

      {/* Categories & Filter Chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted mr-1 flex items-center gap-1">
          <Filter className="size-3" /> Category:
        </span>
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition",
              category === c
                ? "bg-ink text-white"
                : "bg-panel text-ink-2 ring-1 ring-line hover:bg-hover"
            )}
          >
            {c === "ALL" ? "All Items" : c}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-1 border-l border-line pl-3">
          <button
            type="button"
            onClick={() =>
              setStockFilter(
                stockFilter === "ALL"
                  ? "IN_STOCK"
                  : stockFilter === "IN_STOCK"
                  ? "OUT_OF_STOCK"
                  : "ALL"
              )
            }
            className={cn(
              "rounded-control px-2.5 py-1 text-xs font-medium ring-1 transition",
              stockFilter === "ALL"
                ? "bg-panel text-ink-2 ring-line"
                : stockFilter === "IN_STOCK"
                ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                : "bg-amber-50 text-amber-800 ring-amber-200"
            )}
          >
            {stockFilter === "ALL"
              ? "All Stock"
              : stockFilter === "IN_STOCK"
              ? "● In Stock Only"
              : "○ Out of Stock Only"}
          </button>
        </div>
      </div>

      {/* WhatsApp Price List Preview Drawer */}
      {previewOpen && (
        <Card className="animate-pop border-emerald-500/20 bg-emerald-500/5">
          <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2">
              <MessageSquare className="size-4 text-emerald-600" />
              <h3 className="text-sm font-semibold text-ink">
                WhatsApp Live Price List Preview
              </h3>
              <Badge tone="green">Auto-replies</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={copyPriceList}>
                {copied ? (
                  <>
                    <Check className="size-3 text-emerald-600" /> Copied!
                  </>
                ) : (
                  <>
                    <Copy className="size-3" /> Copy text
                  </>
                )}
              </Button>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="text-muted hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
          <div className="p-4 sm:p-5">
            <p className="mb-3 text-xs text-muted">
              This is the automated message sent when customers text &quot;price list&quot;, &quot;rate&quot;, or ask for product prices in WhatsApp:
            </p>
            <div className="max-w-lg rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5 dark:bg-night dark:ring-white/10">
              <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-ink">
                {priceListText}
              </pre>
            </div>
          </div>
        </Card>
      )}

      {/* Products Grid */}
      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <Package className="mx-auto size-10 text-muted opacity-40" />
          <h3 className="mt-3 text-sm font-medium text-ink">No products found</h3>
          <p className="mt-1 text-xs text-muted">
            Try adjusting your search query or category filters.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 sm:gap-4">
          {filtered.map((item) => (
            <div
              key={item.id}
              className={cn(
                "group relative flex flex-col justify-between overflow-hidden rounded-card border bg-panel p-4 transition-all shadow-subtle hover:shadow-card",
                !item.inStock ? "border-amber-200/70 bg-amber-50/20" : "border-line"
              )}
            >
              <div>
                {/* Image and Header */}
                <div className="mb-3 flex items-start gap-3">
                  <div className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-sunken ring-1 ring-black/5">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="size-full object-cover object-center"
                      />
                    ) : (
                      <div className="grid size-full place-items-center text-muted">
                        <Package className="size-6 opacity-40" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="rounded bg-sunken px-1.5 py-0.5 font-mono text-3xs text-muted">
                        {item.retailerId}
                      </span>
                      <Badge tone={item.inStock ? "green" : "amber"} dot>
                        {item.inStock ? "In stock" : "Out of stock"}
                      </Badge>
                    </div>
                    <h4 className="mt-1 line-clamp-2 text-sm font-semibold text-ink group-hover:text-amber-600 transition-colors">
                      {item.name}
                    </h4>
                    <p className="text-3xs text-muted">{item.category}</p>
                  </div>
                </div>

                {/* Description */}
                {item.description && (
                  <p className="mb-3 line-clamp-2 text-xs text-muted">
                    {item.description}
                  </p>
                )}
              </div>

              {/* Price & Actions */}
              <div className="mt-2 border-t border-line/60 pt-3">
                <div className="flex items-baseline justify-between mb-3">
                  <span className="text-xs text-muted">Selling Price</span>
                  <span className="font-semibold text-base tabular text-ink">
                    ₹{item.priceAmount.toLocaleString("en-IN")}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleStock(item)}
                    disabled={pending}
                    className={cn(
                      "flex-1 inline-flex items-center justify-center gap-1.5 rounded-control py-1.5 px-2 text-xs font-medium ring-1 transition",
                      item.inStock
                        ? "bg-amber-50 text-amber-800 ring-amber-200 hover:bg-amber-100"
                        : "bg-emerald-50 text-emerald-800 ring-emerald-200 hover:bg-emerald-100"
                    )}
                  >
                    {item.inStock ? (
                      <>
                        <XCircle className="size-3.5" /> Mark out of stock
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="size-3.5" /> Mark in stock
                      </>
                    )}
                  </button>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleOpenEdit(item)}
                    className="shrink-0"
                    title="Edit price & details"
                  >
                    <Edit2 className="size-3.5" /> Edit
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit Product Modal */}
      {editing && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade overflow-y-auto"
        >
          {/* Solid opaque white card - no transparency */}
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-5 sm:p-6 shadow-2xl ring-1 ring-black/10 border border-line animate-pop dark:bg-stone-900 dark:ring-white/10 my-auto">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h3 className="text-base font-semibold text-ink">
                  Edit Menu Item
                </h3>
                <p className="text-xs text-muted">
                  SKU: <span className="font-mono font-medium">{editing.retailerId}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-full p-1 text-muted hover:bg-sunken hover:text-ink transition"
              >
                <X className="size-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="mt-4 space-y-4">
              {/* Product Photo Upload Section */}
              <div className="rounded-xl border border-line bg-canvas p-3.5 sm:p-4">
                <label className="block text-xs font-medium text-ink mb-2">
                  Product Photo
                </label>
                <div className="flex items-center gap-4">
                  {/* Image Preview */}
                  <div className="relative size-20 shrink-0 overflow-hidden rounded-xl border border-line bg-panel shadow-sm">
                    {editImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={editImageUrl}
                        alt="Product preview"
                        className="size-full object-cover object-center"
                      />
                    ) : (
                      <div className="grid size-full place-items-center text-muted">
                        <ImageIcon className="size-8 opacity-40" />
                      </div>
                    )}
                    {uploadingImage && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white">
                        <Loader2 className="size-5 animate-spin" />
                      </div>
                    )}
                  </div>

                  {/* Upload Controls */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/jpg"
                      onChange={handleImageUpload}
                      className="hidden"
                    />

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={uploadingImage}
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs"
                      >
                        {uploadingImage ? (
                          <>
                            <Loader2 className="size-3.5 animate-spin" /> Uploading...
                          </>
                        ) : (
                          <>
                            <Upload className="size-3.5" /> Upload Image
                          </>
                        )}
                      </Button>

                      {editImageUrl && (
                        <button
                          type="button"
                          onClick={() => setEditImageUrl(null)}
                          className="text-xs text-danger hover:underline"
                        >
                          Remove photo
                        </button>
                      )}
                    </div>

                    <p className="text-3xs text-muted">
                      JPG, PNG or WebP under 5MB. Shows in WhatsApp catalog.
                    </p>
                  </div>
                </div>

                {/* Optional Image URL Input */}
                <div className="mt-3 pt-3 border-t border-line/60">
                  <input
                    type="url"
                    placeholder="Or paste external image URL (https://...)"
                    value={editImageUrl ?? ""}
                    onChange={(e) => setEditImageUrl(e.target.value)}
                    className="field text-xs h-8"
                  />
                </div>
              </div>

              <Field id="productName" label="Product Name">
                <input
                  name="productName"
                  defaultValue={editing.name}
                  required
                  className="field text-sm"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field id="price" label="Price (₹ INR)">
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted">
                      ₹
                    </span>
                    <input
                      name="price"
                      type="number"
                      step="1"
                      min="0"
                      defaultValue={editing.priceAmount}
                      required
                      className="field pl-8 text-sm font-semibold tabular"
                    />
                  </div>
                </Field>

                <Field id="inStock" label="Stock Status">
                  <select
                    name="inStock"
                    defaultValue={editing.inStock ? "true" : "false"}
                    className="field text-sm font-medium"
                  >
                    <option value="true">In Stock</option>
                    <option value="false">Out of Stock</option>
                  </select>
                </Field>
              </div>

              <Field id="description" label="Description" hint="optional">
                <textarea
                  name="description"
                  defaultValue={editing.description ?? ""}
                  rows={2}
                  className="field text-sm"
                  placeholder="E.g. Sulphur free, 100% cold pressed..."
                />
              </Field>

              <div className="rounded-lg bg-sunken p-3 text-xs text-muted flex items-start gap-2">
                <Sparkles className="size-4 text-amber-500 shrink-0 mt-0.5" />
                <p>
                  Updates sync directly to your Meta WhatsApp Business Catalog. Customers tapping &quot;View catalog&quot; will see the updated photo, price, and availability immediately.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" loading={pending || uploadingImage}>
                  Save & Update WhatsApp
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
