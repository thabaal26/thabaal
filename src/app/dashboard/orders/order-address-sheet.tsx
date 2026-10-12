"use client";

import { Check, Loader2, MapPin, MessageSquareQuote, PencilLine, Plus, Sparkles } from "@/components/icons";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Sheet } from "@/components/sheet";
import { toastResult } from "@/components/toast";
import { Badge, Button, Field } from "@/components/ui";
import { parseAddressText } from "@/lib/address";
import { cn } from "@/lib/cn";
import {
  getCustomerAddressSuggestions,
  saveOrderAddress,
  type ChatAddressCandidate,
} from "../actions/orders";

export function OrderAddressControl({
  orderId,
  orderRefText,
  customerId,
  customerName,
  currentOrderNote,
  customerLocation,
  customerLocationRaw,
  canEdit = true,
  compact = false,
}: {
  orderId: string;
  orderRefText: string;
  customerId: string;
  customerName: string;
  currentOrderNote: string | null;
  customerLocation: string | null;
  customerLocationRaw?: string | null;
  canEdit?: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const effectiveAddress =
    currentOrderNote?.trim() ||
    customerLocationRaw?.trim() ||
    customerLocation?.trim() ||
    "";
  const effectiveArea =
    customerLocation?.trim() ||
    (effectiveAddress ? parseAddressText(effectiveAddress).area : null) ||
    "";
  const customerHasSavedAddress = Boolean(
    customerLocation?.trim() || customerLocationRaw?.trim(),
  );

  const [address, setAddress] = useState(effectiveAddress);
  const [area, setArea] = useState(effectiveArea);
  const [areaTouched, setAreaTouched] = useState(false);
  const [syncToCustomer, setSyncToCustomer] = useState(true);
  const [loadingChat, setLoadingChat] = useState(false);
  const [chatCandidates, setChatCandidates] = useState<ChatAddressCandidate[]>([]);
  const [recentMessages, setRecentMessages] = useState<{ text: string; receivedAt: string }[]>([]);

  const openSheet = () => {
    setAddress(effectiveAddress);
    setArea(effectiveArea);
    setAreaTouched(Boolean(customerLocation?.trim()));
    setSyncToCustomer(true);
    setOpen(true);
    setLoadingChat(true);
    getCustomerAddressSuggestions(customerId)
      .then((res) => {
        if (!res.ok) return;
        setChatCandidates(res.chatAddresses);
        setRecentMessages(res.recentChatMessages);
        // If order and customer have no address yet, pre-fill the top detected WhatsApp chat address
        if (!effectiveAddress && res.chatAddresses[0]) {
          setAddress(res.chatAddresses[0].fullAddress);
          if (res.chatAddresses[0].area) setArea(res.chatAddresses[0].area);
        }
      })
      .finally(() => {
        setLoadingChat(false);
      });
  };

  const handleAddressInput = (val: string) => {
    setAddress(val);
    if (!areaTouched) {
      const parsed = parseAddressText(val);
      if (parsed.area) setArea(parsed.area);
    }
  };

  return (
    <>
      <div
        className={cn(
          "flex items-center justify-between gap-2 rounded-control border px-2.5 py-1.5 text-xs",
          effectiveAddress
            ? "border-line/80 bg-subtle/50 text-ink"
            : "border-warning/30 bg-warning-soft/40 text-ink",
          compact && "px-2 py-1",
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <MapPin
            aria-hidden
            className={cn(
              "size-3.5 shrink-0",
              effectiveAddress ? "text-brand-deep" : "text-warning",
            )}
          />
          {effectiveAddress ? (
            <p className="min-w-0 flex-1 truncate text-xs text-ink" title={effectiveAddress}>
              {effectiveArea && (
                <span className="mr-1.5 inline-block rounded bg-panel px-1.5 py-0.5 text-2xs font-semibold text-brand-deep ring-1 ring-line">
                  {effectiveArea}
                </span>
              )}
              <span>{effectiveAddress}</span>
            </p>
          ) : (
            <p className="truncate font-medium text-warning">No delivery address added</p>
          )}
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={openSheet}
            className={cn(
              "print:hidden inline-flex shrink-0 items-center gap-1 rounded-control px-2 py-0.5 text-2xs font-semibold transition",
              effectiveAddress
                ? "bg-panel text-ink-2 ring-1 ring-line hover:bg-sunken hover:text-ink"
                : "bg-brand text-white shadow-xs hover:bg-brand-deep",
            )}
          >
            {effectiveAddress ? (
              <>
                <PencilLine aria-hidden className="size-3" />
                <span>Edit</span>
              </>
            ) : (
              <>
                <Plus aria-hidden className="size-3" />
                <span>Add address</span>
              </>
            )}
          </button>
        )}
      </div>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={`${effectiveAddress ? "Update" : "Add"} delivery address · ${orderRefText}`}
        description={`For ${customerName}. You can pick an address sent in WhatsApp chat or type it below.`}
        className="sm:max-w-lg"
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await saveOrderAddress(orderId, {
                address,
                area,
                syncToCustomer,
                syncOtherActiveOrders: true,
              });
              toastResult(r);
              if (r.ok) {
                setOpen(false);
                router.refresh();
              }
            });
          }}
        >
          {/* Auto-detected addresses from WhatsApp chat */}
          <div className="space-y-2 rounded-card border border-line bg-subtle/50 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                <Sparkles aria-hidden className="size-3.5 text-brand-deep" />
                <span>Auto-detect from WhatsApp chat</span>
              </p>
              {loadingChat && (
                <span className="inline-flex items-center gap-1 text-2xs text-muted">
                  <Loader2 aria-hidden className="size-3 animate-spin" /> Scanning chat…
                </span>
              )}
            </div>

            {chatCandidates.length > 0 ? (
              <div className="space-y-1.5">
                {chatCandidates.map((c, idx) => {
                  const selected = address.trim() === c.fullAddress.trim();
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setAddress(c.fullAddress);
                        if (c.area) setArea(c.area);
                      }}
                      className={cn(
                        "flex w-full items-start justify-between gap-2 rounded-control border px-2.5 py-2 text-left text-xs transition",
                        selected
                          ? "border-brand bg-brand-soft/40 text-ink"
                          : "border-line bg-panel text-ink hover:border-brand/50",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <MessageSquareQuote aria-hidden className="mr-1 inline size-3.5 text-brand-deep" />
                        <span className="font-medium">{c.fullAddress}</span>
                        {c.area && (
                          <span className="ml-1.5 inline-block rounded bg-sunken px-1.5 py-0.5 text-2xs font-semibold text-ink-2">
                            {c.area}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 font-semibold text-brand-deep">
                        {selected ? (
                          <span className="inline-flex items-center gap-0.5 text-success">
                            <Check className="size-3.5" /> Using
                          </span>
                        ) : (
                          "Use address"
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : !loadingChat && recentMessages.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-2xs text-muted">
                  Recent WhatsApp replies from {customerName} (tap any message to use as address):
                </p>
                {recentMessages.slice(0, 3).map((m, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleAddressInput(m.text)}
                    className="flex w-full items-start justify-between gap-2 rounded-control border border-line bg-panel px-2.5 py-1.5 text-left text-xs text-ink-2 hover:border-brand"
                  >
                    <span className="line-clamp-2 flex-1">{m.text}</span>
                    <span className="shrink-0 font-semibold text-brand-deep">Use</span>
                  </button>
                ))}
              </div>
            ) : !loadingChat ? (
              <p className="text-2xs text-muted">
                No address messages spotted in recent WhatsApp replies yet. When {customerName} messages their address or location pin on WhatsApp, it will appear here automatically.
              </p>
            ) : null}
          </div>

          <Field id={`addr-${orderId}`} label="Full delivery address" hint="door no, street, landmark, pincode" required>
            <textarea
              rows={3}
              className="field"
              value={address}
              placeholder="Door No. 12, 3rd Cross Street, Anna Nagar, Madurai - 625020"
              onChange={(e) => handleAddressInput(e.target.value)}
            />
          </Field>

          <Field id={`area-${orderId}`} label="Area / Locality" hint="groups orders on the packing list">
            <input
              className="field"
              value={area}
              placeholder="e.g. Anna Nagar, KK Nagar, Sellur…"
              onChange={(e) => {
                setArea(e.target.value);
                setAreaTouched(true);
              }}
            />
          </Field>

          {/* Two-way Customer <-> Order sync explanation / checkbox */}
          <div className="rounded-control border border-line bg-sunken/70 px-3.5 py-2.5 text-xs">
            {customerHasSavedAddress ? (
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 rounded border-line text-brand focus:ring-brand"
                  checked={syncToCustomer}
                  onChange={(e) => setSyncToCustomer(e.target.checked)}
                />
                <span className="text-ink-2">
                  <b className="font-semibold text-ink">
                    Also update {customerName}&apos;s saved default address
                  </b>
                  <span className="mt-0.5 block text-muted">
                    Keeps the customer profile & future orders in sync. Uncheck if this is a one-time delivery address for this order only.
                  </span>
                </span>
              </label>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink-2">
                  <b className="font-semibold text-ink">{customerName} has no saved address yet</b> — saving will update both this order and their customer profile automatically.
                </span>
                <Badge tone="green">Auto-sync</Badge>
              </div>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={pending} loading={pending}>
            Save delivery address
          </Button>
        </form>
      </Sheet>
    </>
  );
}
