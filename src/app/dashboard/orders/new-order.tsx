"use client";

import { Check, Loader2, MapPin, MessageSquareQuote, Plus, Sparkles, UserCheck, UserPlus } from "@/components/icons";
import Link from "@/components/intent-link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Sheet } from "@/components/sheet";
import { toastResult } from "@/components/toast";
import { Badge, Button, Field } from "@/components/ui";
import { parseAddressText } from "@/lib/address";
import { DEFAULT_SHIPPING_FEE, getOrderPricing } from "@/lib/order-pricing";
import {
  createOrder,
  lookupOrderCustomer,
  type ChatAddressCandidate,
} from "../actions/orders";
import { parseOrderFromChatAction } from "../actions/ai";
import {
  blankOrderLine,
  OrderItemsEditor,
  type CatalogProductOption,
  type EditableOrderLine,
} from "./order-items-editor";
import { PayModePicker, type PayMode } from "./payment-ui";

type Lookup =
  | { phone: string; state: "checking" }
  | {
      phone: string;
      state: "existing";
      id: string;
      name: string;
      optedOut: boolean;
      location: string | null;
      locationRaw: string | null;
      region: string | null;
      chatAddresses: ChatAddressCandidate[];
    }
  | { phone: string; state: "new" }
  | null;

/** For orders taken by phone, at the shop or on paper, so they can be confirmed and dispatched here too. */
export function NewOrder({
  catalogProducts = [],
  catalogId = null,
  isLiveCatalog = false,
  hasPaymentConfig = false,
  initialOpen = false,
}: {
  catalogProducts?: CatalogProductOption[];
  catalogId?: string | null;
  isLiveCatalog?: boolean;
  hasPaymentConfig?: boolean;
  /** Open the form straight away (Home's "New order" links to /dashboard/orders?new=1). */
  initialOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(initialOpen);
  const [pending, start] = useTransition();
  const [aiParsing, startAiParse] = useTransition();
  const [showAiPaste, setShowAiPaste] = useState(false);
  const [rawWhatsAppText, setRawWhatsAppText] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [area, setArea] = useState("");
  const [areaTouched, setAreaTouched] = useState(false);
  const [addressSource, setAddressSource] = useState<"saved" | "chat" | "manual" | null>(null);
  const [syncCustomerAddress, setSyncCustomerAddress] = useState(true);
  const [note, setNote] = useState("");
  const [shippingFee, setShippingFee] = useState<number>(DEFAULT_SHIPPING_FEE);
  const [payMode, setPayMode] = useState<PayMode>("later");
  const [payRef, setPayRef] = useState("");
  const [lines, setLines] = useState<EditableOrderLine[]>(() => [
    blankOrderLine(),
  ]);
  const pricing = getOrderPricing(lines, null, { customShippingFee: shippingFee });
  const total = pricing.total;

  const handleAiExtract = () => {
    if (!rawWhatsAppText.trim()) return;
    startAiParse(async () => {
      const res = await parseOrderFromChatAction(rawWhatsAppText);
      if (!res.ok || !res.data) {
        toastResult({ ok: false, message: res.message ?? "Could not parse WhatsApp message." });
        return;
      }
      const d = res.data;
      if (d.recipientPhone) setPhone(d.recipientPhone);
      if (d.recipientName) setName(d.recipientName);
      const addrParts = [
        d.addressLine1,
        d.addressLine2,
        d.landmark ? `Near ${d.landmark}` : "",
        d.city,
        d.state,
        d.pincode ? `- ${d.pincode}` : "",
      ].filter(Boolean);
      if (addrParts.length > 0) {
        setAddress(addrParts.join(", "));
        setAddressSource("chat");
      }
      if (d.city || d.addressLine2) {
        setArea(d.city || d.addressLine2);
      }
      if (d.itemsSummary || d.amountRupees) {
        setLines([
          {
            ...blankOrderLine(),
            custom: true,
            name: d.itemsSummary || "WhatsApp Order Item",
            quantity: 1,
            price: d.amountRupees ?? 0,
          },
        ]);
      }
      if (d.notes) setNote(d.notes);
      setShowAiPaste(false);
      toastResult({ ok: true, message: "AI extracted customer, items & courier address!" });
    });
  };

  // Look the phone up as it's typed (after a short pause), so the form can say whether the
  // order is for an existing customer or will add a new one, and auto-fill their saved or chat address.
  const [lookup, setLookup] = useState<Lookup>(null);
  const digits = phone.replace(/\D/g, "");
  useEffect(() => {
    if (digits.length < 10) return;
    let live = true;
    const t = setTimeout(async () => {
      setLookup({ phone: digits, state: "checking" });
      const r = await lookupOrderCustomer(digits);
      if (!live) return;
      if (!r.valid) setLookup(null);
      else if (r.existing) {
        const ex = r.existing;
        setLookup({ phone: digits, state: "existing", ...ex });
        // Auto-fill from saved address or best WhatsApp chat address if staff hasn't typed a manual address yet
        const savedFull = ex.locationRaw?.trim() || ex.location?.trim() || "";
        const bestChat = ex.chatAddresses[0];
        if (savedFull) {
          setAddress((prev) => (prev.trim() ? prev : savedFull));
          setArea((prev) => (prev.trim() ? prev : ex.location?.trim() || parseAddressText(savedFull).area || ""));
          setAddressSource((prev) => prev ?? "saved");
        } else if (bestChat) {
          setAddress((prev) => (prev.trim() ? prev : bestChat.fullAddress));
          setArea((prev) => (prev.trim() ? prev : bestChat.area || ""));
          setAddressSource((prev) => prev ?? "chat");
        }
      } else {
        setLookup({ phone: digits, state: "new" });
      }
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [digits]);

  const found = lookup?.phone === digits && digits.length >= 10 ? lookup : null;
  const isNew = found?.state === "new";
  const existingCustomerHasAddress =
    found?.state === "existing" &&
    Boolean(found.location?.trim() || found.locationRaw?.trim());

  const handleAddressChange = (val: string) => {
    setAddress(val);
    setAddressSource("manual");
    if (!areaTouched) {
      const detected = parseAddressText(val);
      if (detected.area) setArea(detected.area);
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} className="max-sm:px-3.5">
        <Plus aria-hidden className="size-4 shrink-0" />{" "}
        <span>
          New<span className="max-sm:sr-only"> order</span>
        </span>
      </Button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="New order"
        description="Select items from your WhatsApp Catalogue or enter custom items, prices and delivery address."
        className="sm:max-w-xl"
      >
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await createOrder({
                phone,
                name,
                items: lines.map((l) => ({
                  id: l.custom ? undefined : l.id,
                  name: l.name,
                  quantity: l.quantity,
                  price: l.price,
                })),
                shippingFee,
                address,
                area,
                syncCustomerAddress,
                note,
                catalogId,
                paymentMode: total > 0 ? (payMode === "request" && !hasPaymentConfig ? "later" : payMode) : "later",
                paymentRef: payMode === "paid_upi" ? payRef : undefined,
              });
              toastResult(r);
              if (r.ok) {
                setOpen(false);
                setPhone("");
                setName("");
                setAddress("");
                setArea("");
                setAreaTouched(false);
                setAddressSource(null);
                setSyncCustomerAddress(true);
                setNote("");
                setShippingFee(DEFAULT_SHIPPING_FEE);
                setPayMode("later");
                setPayRef("");
                setLines([blankOrderLine()]);
                router.refresh();
              }
            });
          }}
        >
          {/* Free AI WhatsApp Chat-to-Order & Shipping Address Parser */}
          <div className="rounded-card border border-brand/30 bg-brand-soft/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-deep">
                <Sparkles aria-hidden className="size-3.5 shrink-0" />
                <span>AI WhatsApp Text-to-Order &amp; Address Parser</span>
              </p>
              <button
                type="button"
                onClick={() => setShowAiPaste((v) => !v)}
                className="text-xs font-semibold text-brand-deep underline-offset-2 hover:underline"
              >
                {showAiPaste ? "Hide" : "Paste WhatsApp message →"}
              </button>
            </div>
            {showAiPaste ? (
              <div className="mt-2.5 space-y-2">
                <textarea
                  rows={3}
                  value={rawWhatsAppText}
                  onChange={(e) => setRawWhatsAppText(e.target.value)}
                  placeholder="Paste unstructured WhatsApp text (e.g. Priya Sharma, 9876543210, 2 Silk Sarees Rs 2400, Door No 12, Anna Nagar near Bus Stand, Madurai 625020)…"
                  className="field text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  loading={aiParsing}
                  disabled={!rawWhatsAppText.trim()}
                  onClick={handleAiExtract}
                >
                  <Sparkles aria-hidden className="size-3.5 shrink-0" /> Auto-Fill Customer, Items &amp; Pincode
                </Button>
              </div>
            ) : (
              <p className="mt-0.5 text-[11px] text-muted">
                Paste any unstructured WhatsApp message to auto-extract name, phone, items, price, landmark, city &amp; 6-digit pincode.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id="no-phone" label="Customer phone" required>
                <input
                  className="field"
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  value={phone}
                  placeholder="98765 43210"
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setAddressSource(null);
                  }}
                />
              </Field>
              {found?.state === "existing" ? (
                <div>
                  <p className="mb-1.5 text-sm font-medium text-ink">Name</p>
                  <p className="flex min-h-11 items-center truncate rounded-control border border-line bg-subtle px-3 text-sm text-ink-2 sm:min-h-10">
                    {found.name}
                  </p>
                </div>
              ) : (
                <Field
                  id="no-name"
                  label="Name"
                  hint={isNew ? "new customer" : "if new"}
                  required={isNew}
                >
                  <input
                    className="field"
                    autoCapitalize="words"
                    value={name}
                    placeholder="Priya Sharma"
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>
              )}
            </div>
            <div aria-live="polite" className="min-h-6 text-sm">
              {found?.state === "checking" && (
                <span className="inline-flex items-center gap-1.5 text-muted">
                  <Loader2 aria-hidden className="size-3.5 shrink-0 animate-spin" /> Checking customer & recent WhatsApp chat…
                </span>
              )}
              {found?.state === "existing" && (
                <span className="inline-flex flex-wrap items-center gap-1.5 text-ink-2">
                  <UserCheck aria-hidden className="size-4 shrink-0 text-success" /> Existing customer:
                  <Link
                    href={`/dashboard/customers/${found.id}`}
                    className="font-medium text-ink underline-offset-2 hover:underline"
                  >
                    {found.name}
                  </Link>
                  {found.location && (
                    <Badge tone="brand">
                      <MapPin aria-hidden className="mr-0.5 inline size-3 shrink-0" /> {found.location}
                    </Badge>
                  )}
                  {found.optedOut && <Badge tone="red">Opted out of messages</Badge>}
                </span>
              )}
              {isNew && (
                <span className="inline-flex items-center gap-1.5 text-ink-2">
                  <UserPlus aria-hidden className="size-4 shrink-0 text-info" /> New customer: they&apos;ll be added to Customers with this order & address.
                </span>
              )}
            </div>
          </div>

          <OrderItemsEditor
            lines={lines}
            onChange={setLines}
            catalogProducts={catalogProducts}
            isLiveCatalog={isLiveCatalog}
          />

          {/* Delivery Address & Area section with automatic WhatsApp chat detection */}
          <div className="space-y-3 rounded-card border border-line bg-subtle/50 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                <MapPin aria-hidden className="size-4 shrink-0 text-brand-deep" />
                <span>Delivery Address & Area</span>
              </div>
              {addressSource === "saved" && (
                <Badge tone="green">Auto-filled from saved profile</Badge>
              )}
              {addressSource === "chat" && (
                <Badge tone="blue">Auto-detected from WhatsApp chat</Badge>
              )}
            </div>

            {found?.state === "existing" && found.chatAddresses.length > 0 && (
              <div className="space-y-1.5 rounded-control border border-brand/25 bg-brand-soft/40 p-2.5 text-xs">
                <p className="flex items-center gap-1.5 font-semibold text-brand-deep">
                  <Sparkles aria-hidden className="size-3.5 shrink-0" />
                  Address spotted in {found.name}&apos;s WhatsApp messages (tap to use):
                </p>
                <div className="space-y-1.5">
                  {found.chatAddresses.map((cand, idx) => {
                    const active = address.trim() === cand.fullAddress.trim();
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setAddress(cand.fullAddress);
                          if (cand.area) setArea(cand.area);
                          setAddressSource("chat");
                          setSyncCustomerAddress(true);
                        }}
                        className="flex w-full items-start justify-between gap-2 rounded-control border border-line bg-panel px-2.5 py-2 text-left text-xs text-ink transition hover:border-brand"
                      >
                        <span className="min-w-0 flex-1">
                          <MessageSquareQuote aria-hidden className="mr-1 inline size-3.5 shrink-0 text-muted" />
                          <span className="font-medium">{cand.fullAddress}</span>
                          {cand.area && (
                            <span className="ml-1.5 inline-block rounded bg-sunken px-1.5 py-0.5 text-2xs font-semibold text-ink-2">
                              {cand.area}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 font-semibold text-brand-deep">
                          {active ? (
                            <span className="inline-flex items-center gap-0.5 text-success">
                              <Check className="size-3.5 shrink-0" /> Selected
                            </span>
                          ) : (
                            "Use"
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_11rem]">
              <Field id="no-address" label="Full delivery address" hint="door no, street, landmark, pincode">
                <textarea
                  rows={2}
                  className="field"
                  autoComplete="street-address"
                  value={address}
                  placeholder="Door No. 12, 3rd Cross Street, Anna Nagar, Madurai - 625020"
                  onChange={(e) => handleAddressChange(e.target.value)}
                />
              </Field>
              <Field id="no-area" label="Area / Locality" hint="for packing list">
                <input
                  className="field"
                  value={area}
                  placeholder="e.g. Anna Nagar"
                  onChange={(e) => {
                    setArea(e.target.value);
                    setAreaTouched(true);
                  }}
                />
              </Field>
            </div>

            { (address.trim() || area.trim()) && (
              existingCustomerHasAddress ? (
                <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-2">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-line text-brand focus:ring-brand"
                    checked={syncCustomerAddress}
                    onChange={(e) => setSyncCustomerAddress(e.target.checked)}
                  />
                  <span>
                    Also update <b>{found?.state === "existing" ? found.name : "customer"}&apos;s</b> saved default address
                  </span>
                </label>
              ) : (
                <p className="text-xs text-muted">
                  This customer has no saved address yet — this address will automatically be saved to their customer profile too.
                </p>
              )
            )}
          </div>

          <Field id="no-note" label="Order note / instructions" hint="optional">
            <input
              className="field"
              value={note}
              placeholder="Custom pack instructions, delivery timing, payment mode…"
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>

          {total > 0 && (
            <PayModePicker
              value={payMode}
              onChange={setPayMode}
              canRequest={hasPaymentConfig}
              total={total}
              reference={payRef}
              onReference={setPayRef}
            />
          )}

          <div className="space-y-2 rounded-control border border-line bg-sunken px-4 py-3 text-sm">
            <div className="flex items-center justify-between text-xs text-ink-2">
              <span>Items subtotal</span>
              <span className="tabular font-medium">₹{pricing.subtotal.toLocaleString("en-IN")}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-ink-2">
              <label htmlFor="no-shipping" className="flex items-center gap-1.5">
                <span>Shipping charge</span>
                <span className="rounded bg-brand-soft px-1.5 py-0.5 text-2xs font-semibold text-brand-deep">
                  ₹{DEFAULT_SHIPPING_FEE} standard
                </span>
              </label>
              <div className="relative w-24">
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted">
                  ₹
                </span>
                <input
                  id="no-shipping"
                  type="number"
                  min={0}
                  step="1"
                  inputMode="numeric"
                  value={shippingFee}
                  onChange={(e) => setShippingFee(Math.max(0, Number(e.target.value) || 0))}
                  className="field tabular h-8 min-h-8 pl-6 pr-2 text-right text-xs font-semibold"
                />
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-line pt-2 font-semibold text-ink">
              <span>Final Total</span>
              <span className="tabular text-base">₹{pricing.total.toLocaleString("en-IN")}</span>
            </div>
          </div>
          <Button type="submit" className="w-full" loading={pending}>
            {isNew ? "Add order and save customer" : "Add order"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
