"use client";

import { Phone } from "@/components/icons";
import { placeCall } from "@/components/call-widget";
import { Button } from "@/components/ui";
import { useTr } from "@/lib/i18n/context";

/** Rings the customer on WhatsApp; the dashboard's call widget runs the call. */
export function CallButton({ customerId, name, primary }: { customerId: string; name: string; primary: boolean }) {
  const { isTa } = useTr();
  return (
    <Button type="button" variant={primary ? "primary" : "secondary"} onClick={() => placeCall({ customerId, name })}>
      <Phone aria-hidden className="size-4 shrink-0" />{" "}
      {isTa ? (
        <span>
          <span className="max-sm:sr-only">WhatsApp-ல் </span>அழை
        </span>
      ) : (
        <span>
          Call<span className="max-sm:sr-only"> on WhatsApp</span>
        </span>
      )}
    </Button>
  );
}
