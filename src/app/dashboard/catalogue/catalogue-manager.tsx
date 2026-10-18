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
import { useLanguage } from "@/lib/i18n/context";
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
function PhotoField({ value, onChange, removable, isTa = false }: { value: string | null; onChange: (url: string | null) => void; removable: boolean; isTa?: boolean }) {
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
      toast(true, isTa ? "படம் பதிவேற்றப்பட்டது. சேமிக்கவும்." : "Photo uploaded. Save to apply it.");
    } else toast(false, res.message ?? (isTa ? "படத்தை பதிவேற்ற முடியவில்லை." : "Couldn't upload the photo."));
  };

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-ink">{isTa ? "புகைப்படம்" : "Photo"}</p>
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
              <span className="sr-only">{isTa ? "பதிவேற்றப்படுகிறது" : "Uploading"}</span>
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={upload} className="hidden" />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
              {uploading ? <Loader2 aria-hidden className="animate-spin" /> : <Upload aria-hidden />}
              {uploading ? (isTa ? "பதிவேற்றப்படுகிறது…" : "Uploading…") : value ? (isTa ? "படத்தை மாற்று" : "Replace photo") : (isTa ? "படம் பதிவேற்று" : "Upload photo")}
            </Button>
            {value && removable && (
              <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)} className="text-danger hover:text-danger">
                {isTa ? "நீக்கு" : "Remove"}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted">{isTa ? "JPG, PNG அல்லது WebP, 4 MB-க்குள். சதுர படங்கள் WhatsApp-ல் அழகாக இருக்கும்." : "JPG, PNG or WebP, under 4 MB. Square photos look best in WhatsApp."}</p>
        </div>
      </div>
      <label htmlFor="product-image-url" className="sr-only">
        {isTa ? "பட இணைப்பு" : "Image link"}
      </label>
      <input
        id="product-image-url"
        type="url"
        placeholder={isTa ? "அல்லது நேரடிப் பட இணைப்பை ஒட்டவும் (https://…)" : "Or paste a public image link (https://…)"}
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
  const { isTa } = useLanguage();
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
      const cat = p.category || (isTa ? "பொதுவானவை" : "General");
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    });

    const lines: string[] = [
      `🛒 *${clientName} – ${isTa ? "விலைப் பட்டியல்" : "Price List"}*`,
      isTa ? `விலைப் பட்டியல்\n` : `Price List\n`,
    ];

    Object.entries(groups).forEach(([cat, items]) => {
      lines.push(`*${cat}*`);
      items.forEach((item) => {
        lines.push(`• ${item.name} – ₹${item.priceAmount}`);
      });
      lines.push("");
    });

    lines.push(isTa ? `ஆர்டர் செய்ய கீழே உள்ள *View catalog*-ஐ அழுத்தவும் 👇` : `Tap *View catalog* below to order 👇`);
    return lines.join("\n");
  }, [products, clientName, isTa]);

  const copyPriceList = async () => {
    try {
      await navigator.clipboard.writeText(priceListText);
      setCopied(true);
      toast(true, isTa ? "விலைப் பட்டியல் நகலெடுக்கப்பட்டது" : "Price list copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast(false, isTa ? "நகலெடுக்க முடியவில்லை. உரையைத் தேர்ந்தெடுத்து நகலெடுக்கவும்." : "Couldn't copy. Select the text and copy it instead.");
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
      title: isTa ? `${item.name}-ஐ நீக்கவா?` : `Delete ${item.name}?`,
      message: isTa
        ? `இது உங்கள் WhatsApp பட்டியலில் இருந்து (${item.retailerId}) நீக்கப்படும். வாடிக்கையாளர்கள் இனி இதை ஆர்டர் செய்ய முடியாது. பழைய ஆர்டர்கள் அப்படியே இருக்கும்.`
        : `It will be removed from your WhatsApp catalogue (${item.retailerId}) and customers can no longer order it. Past orders keep their details.`,
      confirmLabel: isTa ? "பொருளை நீக்கு" : "Delete product",
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
      ? { tone: "mute", label: isTa ? "சேமிக்கப்பட்ட நகல்" : "Saved copy" }
      : st === "APPROVED"
        ? { tone: "ok", label: isTa ? "இணைக்கப்பட்டது" : "Synced" }
        : st === "REJECTED"
          ? { tone: "bad", label: isTa ? "Meta-வால் நிராகரிக்கப்பட்டது" : "Rejected by Meta" }
          : st === "PENDING" || st === "OUTDATED"
            ? { tone: "warn", label: isTa ? "Meta அனுமதிக்கு காத்திருக்கிறது" : "Waiting for Meta" }
            : { tone: "mute", label: isTa ? "இணைக்கப்படவில்லை" : "Not synced" };

  return (
    <div>
      <div className="toolbar">
        <div className="search">
          <Search aria-hidden />
          <input
            type="search"
            placeholder={isTa ? "பொருட்களைத் தேடுங்கள்…" : "Search products"}
            aria-label={isTa ? "பொருட்களைத் தேடுங்கள்" : "Search products"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="chips">
          {(
            [
              ["ALL", isTa ? "அனைத்தும்" : "All"],
              ["IN_STOCK", isTa ? "இருப்பு உள்ளது" : "In stock"],
              ["OUT_OF_STOCK", isTa ? "இருப்பு இல்லை" : "Out of stock"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" className="chip" aria-pressed={stockFilter === k} onClick={() => setStockFilter(k)}>
              {label}
            </button>
          ))}
          {inCartsCount > 0 && (
            <button type="button" className="chip" aria-pressed={cartFilter === "IN_CARTS"} onClick={() => setCartFilter(cartFilter === "IN_CARTS" ? "ALL" : "IN_CARTS")}>
              {isTa ? "கார்ட்டில் உள்ளவை" : "In carts"} <small>{inCartsCount}</small>
            </button>
          )}
        </div>
        {categories.length > 2 && (
          <select aria-label={isTa ? "வகை" : "Category"} style={{ width: "auto" }} value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === "ALL" ? (isTa ? "வகை: அனைத்தும்" : "Category: all") : c}
              </option>
            ))}
          </select>
        )}
        {isLive && (
          <select aria-label={isTa ? "WhatsApp நிலை" : "WhatsApp status"} style={{ width: "auto" }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
            <option value="ALL">{isTa ? "WhatsApp: அனைத்தும்" : "WhatsApp: all"}</option>
            <option value="APPROVED">{isTa ? "பட்டியலில் இணைந்தது" : "Synced to catalogue"}</option>
            <option value="REVIEW">{isTa ? "Meta அனுமதிக்கு காத்திருக்கிறது" : "Waiting for Meta"}</option>
            <option value="REJECTED">{isTa ? "Meta-வால் நிராகரிக்கப்பட்டது" : "Rejected by Meta"}</option>
          </select>
        )}
        <div className="tools" style={{ marginLeft: "auto" }}>
          <button type="button" className="btn sm" aria-expanded={previewOpen} onClick={() => setPreviewOpen(!previewOpen)}>
            {previewOpen ? (isTa ? "விலைப் பட்டியலை மறை" : "Hide price list") : (isTa ? "விலைப் பட்டியல் அனுப்பு" : "Send price list")}
          </button>
          {canAdd && (
            <button type="button" className="btn sm primary" onClick={() => setAdding(true)}>
              <Plus aria-hidden className="ic" style={{ width: 15, height: 15 }} /> {isTa ? "பொருள் சேர்" : "Add product"}
            </button>
          )}
        </div>
      </div>

      {previewOpen && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="hd">
            <div>
              <h2>{isTa ? "விலைப் பட்டியல் செய்தி" : "Price list message"}</h2>
              <p>{isTa ? "விலை உள்ள பொருட்கள். வாடிக்கையாளர்களுக்கு அனுப்பும்போது அவர்கள் 'View catalog' மூலம் ஆர்டர் செய்யலாம்." : "In-stock products with a price. Paste it in a chat; customers get your catalogue with “View catalog”."}</p>
            </div>
            <button type="button" className="btn sm" onClick={copyPriceList}>
              {copied ? (isTa ? "நகலெடுக்கப்பட்டது" : "Copied") : (isTa ? "நகலெடு" : "Copy text")}
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
                <th>{isTa ? "பொருள்" : "Product"}</th>
                <th>{isTa ? "வகை" : "Category"}</th>
                <th className="num">{isTa ? "விலை" : "Price"}</th>
                <th>{isTa ? "இருப்பு நிலை" : "In stock"}</th>
                <th>WhatsApp</th>
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
                            {d && d.cartCount > 0 && (isTa ? ` · ${d.cartCount} கார்ட்டுகளில்` : ` · in ${d.cartCount} cart${d.cartCount === 1 ? "" : "s"}`)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>{item.category || "—"}</td>
                    <td className="num">{item.priceAmount > 0 ? `₹${item.priceAmount.toLocaleString("en-IN")}` : <span className="muted">{isTa ? "விலை இல்லை" : "No price"}</span>}</td>
                    <td>
                      <button
                        type="button"
                        className="sw"
                        role="switch"
                        aria-checked={item.inStock}
                        aria-label={`${isTa ? "இருப்பு நிலை" : "In stock"}: ${item.name}`}
                        disabled={!canManage || togglingId !== null || !isLive}
                        onClick={() => handleToggleStock(item)}
                        style={togglingId === item.id ? { opacity: 0.6 } : undefined}
                      />
                    </td>
                    <td>
                      <span className={`pill ${pill.tone}`}>{pill.label}</span>
                    </td>
                    <td>
                      <div className="tools">
                        {canManage && isLive && (
                          <button type="button" className="btn sm" onClick={() => handleOpenEdit(item)} aria-label={`${isTa ? "திருத்து" : "Edit"} ${item.name}`}>
                            {isTa ? "திருத்து" : "Edit"}
                          </button>
                        )}
                        <Link className="btn sm ghost" href="/dashboard/campaigns/new">
                          {isTa ? "பிரச்சாரம் செய்" : "Make a campaign"}
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
            {products.length ? (isTa ? "பொருட்கள் எதுவும் பொருந்தவில்லை." : "No products match.") : (isTa ? "இன்னும் பொருட்கள் எதுவும் இல்லை." : "No products yet.")}
          </p>
        )}
      </div>

      <Sheet
        open={!!editing}
        onClose={() => !saving && setEditing(null)}
        title={isTa ? "பொருளைத் திருத்து" : "Edit product"}
        description={editing ? <>SKU <span className="font-mono">{editing.retailerId}</span></> : undefined}
        className="sm:max-w-lg"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            {canManage && isLive && (
              <Button type="button" variant="ghost" onClick={handleDelete} disabled={saving} className="text-danger hover:bg-danger-bg hover:text-danger sm:mr-auto">
                <Trash2 aria-hidden /> {isTa ? "நீக்கு" : "Delete"}
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={() => setEditing(null)} disabled={saving} className="sm:ml-auto">
              {isTa ? "ரத்து" : "Cancel"}
            </Button>
            <Button type="submit" form="edit-product" loading={saving}>
              {isTa ? "சேமிக்க" : "Save product"}
            </Button>
          </div>
        }
      >
        {editing && (
          <form id="edit-product" onSubmit={handleSaveEdit} className="space-y-4">
            {isLive && editing.whatsappStatus && (
              <div className="flex items-center justify-between rounded-control border border-line bg-subtle p-3 text-xs">
                <span className="font-medium text-ink">{isTa ? "Meta WhatsApp ஆய்வு:" : "Meta WhatsApp Review:"}</span>
                {editing.whatsappStatus === "APPROVED" ? (
                  <Badge tone="green" dot>
                    {isTa ? "அங்கீகரிக்கப்பட்டு WhatsApp-ல் உள்ளது" : "Approved & Live on WhatsApp"}
                  </Badge>
                ) : editing.whatsappStatus === "REJECTED" ? (
                  <Badge tone="red" dot>
                    {isTa ? "Meta விதிகளால் நிராகரிக்கப்பட்டது" : "Rejected by Meta Policy"}
                  </Badge>
                ) : (
                  <Badge tone="amber" dot>
                    {isTa ? "Meta பரிசீலனையில் உள்ளது" : "Under Review by Meta"}
                  </Badge>
                )}
              </div>
            )}
            <PhotoField value={editImageUrl} onChange={setEditImageUrl} removable={!isLive} isTa={isTa} />

            <Field id="productName" label={isTa ? "பொருளின் பெயர்" : "Product name"} required>
              <input name="productName" defaultValue={editing.name} maxLength={100} className="field" />
            </Field>

            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
              <Field id="price" label={isTa ? "விலை" : "Price"} hint="₹ INR" required>
                <input name="price" type="number" inputMode="decimal" step="0.01" min="1" defaultValue={editing.priceAmount} className="field tabular" />
              </Field>
              <Field id="inStock" label={isTa ? "இருப்பு" : "Stock"}>
                <select name="inStock" defaultValue={editing.inStock ? "true" : "false"} className="field">
                  <option value="true">{isTa ? "இருப்பு உள்ளது" : "In stock"}</option>
                  <option value="false">{isTa ? "இருப்பு இல்லை" : "Out of stock"}</option>
                </select>
              </Field>
            </div>

            <Field id="description" label={isTa ? "விவரம்" : "Description"} hint={isTa ? "விருப்பத்தேர்வு" : "optional"}>
              <textarea name="description" defaultValue={editing.description ?? ""} rows={3} maxLength={5000} className="field" placeholder={isTa ? "உதாரணமாக: கலப்படமில்லாத சுத்தமான நல்லெண்ணெய்" : "E.g. Sulphur free, 100% cold pressed"} />
            </Field>

            <p className="rounded-control bg-subtle p-3 text-xs text-muted">
              {isLive
                ? (isTa ? "சேமிக்கும்போது Meta-வில் உங்கள் WhatsApp பட்டியலில் இது புதுப்பிக்கப்படும். வாடிக்கையாளர்களுக்குத் தெரிய ஒரு நிமிடம் ஆகலாம்." : "Saving updates this product in your WhatsApp catalogue on Meta. It can take a minute before customers see the change.")
                : (isTa ? "டெமோ முறை: WhatsApp Cloud API இணைக்கப்படாததால், மாற்றங்கள் போர்ட்டலில் மட்டுமே வைக்கப்படும்." : "Demo mode: changes are kept in the portal only, because the WhatsApp Cloud API isn't connected.")}
            </p>
          </form>
        )}
      </Sheet>

      {/* Add */}
      <Sheet
        open={adding}
        onClose={() => !saving && setAdding(false)}
        title={isTa ? "புதிய பொருள் சேர்" : "Add product"}
        description={isTa ? "வாடிக்கையாளர்கள் ஆர்டர் செய்ய இது உங்கள் WhatsApp பட்டியலில் தோன்றும்." : "It appears in your WhatsApp catalogue for customers to order."}
        className="sm:max-w-lg"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setAdding(false)} disabled={saving}>
              {isTa ? "ரத்து" : "Cancel"}
            </Button>
            <Button type="submit" form="add-product" loading={saving}>
              {isTa ? "பொருள் சேர்" : "Add product"}
            </Button>
          </div>
        }
      >
        {adding && (
          <form id="add-product" onSubmit={handleCreate} className="space-y-4">
            <PhotoField value={addImageUrl} onChange={setAddImageUrl} removable isTa={isTa} />
            <Field id="newName" label={isTa ? "பொருளின் பெயர்" : "Product name"} required>
              <input name="newName" maxLength={100} className="field" placeholder={isTa ? "எ.கா. செக்கு நல்லெண்ணெய் 1L" : "E.g. Cold-pressed gingelly oil 1L"} />
            </Field>
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
              <Field id="sku" label="SKU" hint={isTa ? "தனி குறியீடு" : "unique code"} required>
                <input name="sku" defaultValue={nextSku(products)} maxLength={50} pattern="[\w.\-]{1,50}" className="field font-mono" />
              </Field>
              <Field id="newPrice" label={isTa ? "விலை" : "Price"} hint="₹ INR" required>
                <input name="newPrice" type="number" inputMode="decimal" step="0.01" min="1" className="field tabular" />
              </Field>
            </div>
            <Field id="newStock" label={isTa ? "இருப்பு" : "Stock"}>
              <select name="newStock" defaultValue="true" className="field">
                <option value="true">{isTa ? "இருப்பு உள்ளது" : "In stock"}</option>
                <option value="false">{isTa ? "இருப்பு இல்லை" : "Out of stock"}</option>
              </select>
            </Field>
            <Field id="newDescription" label={isTa ? "விவரம்" : "Description"} hint={isTa ? "விருப்பத்தேர்வு" : "optional"}>
              <textarea name="newDescription" rows={3} maxLength={5000} className="field" placeholder={isTa ? "பொருளின் சிறப்பு அம்சங்கள்" : "What makes it special"} />
            </Field>
          </form>
        )}
      </Sheet>
    </div>
  );
}
