"use client";

import { PencilLine, Plus, Store, Trash2 } from "@/components/icons";
import { useState } from "react";
import { Badge, Button } from "@/components/ui";
import { cn } from "@/lib/cn";

export type CatalogProductOption = {
  id: string;
  retailerId: string;
  name: string;
  priceAmount: number;
  inStock: boolean;
  category: string;
};

export type EditableOrderLine = {
  id?: string;
  name: string;
  quantity: number;
  price: number;
  custom?: boolean;
};

export const blankOrderLine = (): EditableOrderLine => ({
  id: undefined,
  name: "",
  quantity: 1,
  price: 0,
  custom: false,
});

/**
 * Shared order line editor used by both "New order" and "Edit order items".
 * Lets staff pick from live Meta Catalogue products (auto-filling SKU & price)
 * OR switch any row to custom entry to type a custom item name and price.
 */
export function OrderItemsEditor({
  lines,
  onChange,
  catalogProducts = [],
  isLiveCatalog = false,
}: {
  lines: EditableOrderLine[];
  onChange: (next: EditableOrderLine[]) => void;
  catalogProducts?: CatalogProductOption[];
  isLiveCatalog?: boolean;
}) {
  const [showQuickPick, setShowQuickPick] = useState(false);
  const hasCatalog = catalogProducts.length > 0;

  // Group catalogue products by category for the select optgroups
  const categories = Array.from(new Set(catalogProducts.map((p) => p.category || "General")));

  const editLine = (index: number, patch: Partial<EditableOrderLine>) => {
    onChange(lines.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  };

  const selectCatalogProduct = (index: number, value: string) => {
    if (value === "__custom__") {
      editLine(index, { id: undefined, custom: true, name: "", price: 0 });
      return;
    }
    const prod = catalogProducts.find((p) => p.retailerId === value);
    if (!prod) return;
    editLine(index, {
      id: prod.retailerId,
      name: prod.name,
      price: prod.priceAmount,
      custom: false,
    });
  };

  const quickAddProduct = (prod: CatalogProductOption) => {
    const existingIdx = lines.findIndex((l) => l.id === prod.retailerId || (!l.custom && l.name === prod.name));
    if (existingIdx >= 0) {
      editLine(existingIdx, { quantity: (Number(lines[existingIdx].quantity) || 0) + 1 });
      return;
    }
    // If the first row is empty, fill it; otherwise append a new row
    if (lines.length === 1 && !lines[0].name.trim() && !lines[0].price) {
      onChange([{ id: prod.retailerId, name: prod.name, quantity: 1, price: prod.priceAmount, custom: false }]);
    } else {
      onChange([...lines, { id: prod.retailerId, name: prod.name, quantity: 1, price: prod.priceAmount, custom: false }]);
    }
  };

  const inStockProducts = catalogProducts.filter((p) => p.inStock);

  return (
    <fieldset className="space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <legend className="flex items-center gap-2 text-sm font-medium text-ink-2">
          <span>Items</span>
          {hasCatalog && (
            <Badge tone={isLiveCatalog ? "green" : "gray"} dot>
              {isLiveCatalog ? "Live catalogue" : "Saved catalogue"}
            </Badge>
          )}
        </legend>
        {inStockProducts.length > 0 && (
          <button
            type="button"
            onClick={() => setShowQuickPick((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-deep hover:underline"
          >
            <Store aria-hidden className="size-3.5" />
            {showQuickPick ? "Hide quick pick" : `Quick pick (${inStockProducts.length})`}
          </button>
        )}
      </div>

      {showQuickPick && inStockProducts.length > 0 && (
        <div className="rounded-control border border-line bg-sunken p-2.5">
          <p className="mb-1.5 text-2xs font-medium uppercase tracking-wider text-muted">Tap to add from catalogue</p>
          <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto thin-scroll">
            {inStockProducts.map((p) => {
              const countInCart = lines
                .filter((l) => l.id === p.retailerId || (!l.custom && l.name === p.name))
                .reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
              return (
                <button
                  key={p.retailerId}
                  type="button"
                  onClick={() => quickAddProduct(p)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition active:scale-[0.98]",
                    countInCart > 0
                      ? "border-brand bg-brand-soft font-medium text-brand-deep"
                      : "border-line bg-panel text-ink hover:border-line-strong",
                  )}
                >
                  <span className="truncate max-w-40">{p.name}</span>
                  <span className="tabular text-muted">₹{p.priceAmount}</span>
                  {countInCart > 0 && (
                    <span className="tabular rounded-full bg-brand px-1.5 py-0.2 text-2xs font-semibold text-white">
                      ×{countInCart}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {lines.map((l, k) => {
          const matchedCatalog = hasCatalog
            ? catalogProducts.find((p) => (l.id && p.retailerId === l.id) || p.name.toLowerCase() === l.name.trim().toLowerCase())
            : undefined;
          const isCustom = Boolean(l.custom || !hasCatalog || (l.name.trim() && !matchedCatalog));
          const selectValue = isCustom ? "__custom__" : (matchedCatalog?.retailerId ?? "");

          return (
            <div
              key={k}
              className="space-y-2 rounded-control border border-line bg-sunken/70 p-2.5 sm:space-y-1.5"
            >
              {/* Top row: Catalogue selector or custom input + mode toggle + delete button */}
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  {hasCatalog && !isCustom ? (
                    <select
                      className="field w-full"
                      aria-label={`Select catalogue item ${k + 1}`}
                      value={selectValue}
                      onChange={(e) => selectCatalogProduct(k, e.target.value)}
                    >
                      <option value="">Choose from catalogue…</option>
                      {categories.map((cat) => (
                        <optgroup key={cat} label={cat}>
                          {catalogProducts
                            .filter((p) => (p.category || "General") === cat)
                            .map((p) => (
                              <option key={p.retailerId} value={p.retailerId} disabled={!p.inStock}>
                                {p.name} — ₹{p.priceAmount}
                                {!p.inStock ? " (Out of stock)" : ""}
                              </option>
                            ))}
                        </optgroup>
                      ))}
                      <option value="__custom__">✏️ Custom item (type manually)…</option>
                    </select>
                  ) : (
                    <input
                      className="field w-full"
                      required
                      value={l.name}
                      placeholder="Type custom item name (e.g. Groundnut oil 500ml)…"
                      aria-label={`Item ${k + 1} name`}
                      onChange={(e) => editLine(k, { name: e.target.value, custom: true })}
                    />
                  )}
                </div>

                {hasCatalog && (
                  <button
                    type="button"
                    title={isCustom ? "Pick from catalogue list" : "Customize item name"}
                    onClick={() => editLine(k, { custom: !isCustom, ...(isCustom ? {} : { id: undefined }) })}
                    className={cn(
                      "inline-flex h-10 shrink-0 items-center gap-1 rounded-control border px-2.5 text-xs font-medium transition",
                      isCustom
                        ? "border-brand bg-brand-soft text-brand-deep"
                        : "border-line bg-panel text-ink-2 hover:border-line-strong",
                    )}
                  >
                    {isCustom ? (
                      <>
                        <Store aria-hidden className="size-3.5" />
                        <span className="max-sm:sr-only">Catalogue</span>
                      </>
                    ) : (
                      <>
                        <PencilLine aria-hidden className="size-3.5" />
                        <span className="max-sm:sr-only">Custom</span>
                      </>
                    )}
                  </button>
                )}

                <button
                  type="button"
                  aria-label={`Remove item ${k + 1}`}
                  disabled={lines.length === 1}
                  className="grid size-10 shrink-0 place-items-center rounded-control text-muted transition hover:bg-canvas hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => onChange(lines.filter((_, i) => i !== k))}
                >
                  <Trash2 aria-hidden className="size-4" />
                </button>
              </div>

              {/* Bottom row: Quantity, Unit Price (₹ each), and Line Subtotal */}
              <div className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2 sm:grid-cols-[6.5rem_9rem_1fr]">
                <div>
                  <label className="sr-only" htmlFor={`qty-${k}`}>
                    Quantity of item {k + 1}
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted">
                      Qty
                    </span>
                    <input
                      id={`qty-${k}`}
                      className="field tabular pl-9 pr-2 text-right"
                      type="number"
                      min={1}
                      inputMode="numeric"
                      value={l.quantity || ""}
                      placeholder="1"
                      onChange={(e) => editLine(k, { quantity: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div>
                  <label className="sr-only" htmlFor={`price-${k}`}>
                    Price each of item {k + 1}
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted">
                      ₹
                    </span>
                    <input
                      id={`price-${k}`}
                      className="field tabular pl-6 pr-2"
                      type="number"
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      value={l.price || ""}
                      placeholder="each"
                      onChange={(e) => editLine(k, { price: Number(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="tabular text-right text-xs font-medium text-ink-2">
                  {Number(l.price) > 0 && Number(l.quantity) > 0 ? (
                    <>Subtotal: ₹{((Number(l.price) || 0) * (Number(l.quantity) || 0)).toLocaleString("en-IN")}</>
                  ) : (
                    <span className="text-muted">₹0</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-brand-deep"
          onClick={() => onChange([...lines, blankOrderLine()])}
        >
          <Plus aria-hidden className="size-4" /> Add catalogue item
        </Button>
        {hasCatalog && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-ink-2"
            onClick={() => onChange([...lines, { ...blankOrderLine(), custom: true }])}
          >
            <PencilLine aria-hidden className="size-3.5" /> Add custom item
          </Button>
        )}
      </div>
    </fieldset>
  );
}
