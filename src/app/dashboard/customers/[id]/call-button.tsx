"use client";

import { Phone } from "lucide-react";
import { placeCall } from "@/components/call-widget";
import { Button } from "@/components/ui";

/** Rings the customer on WhatsApp; the dashboard's call widget runs the call. */
export function CallButton({ customerId, name, primary }: { customerId: string; name: string; primary: boolean }) {
  return (
    <Button type="button" variant={primary ? "primary" : "secondary"} onClick={() => placeCall({ customerId, name })}>
      <Phone className="size-4" /> Call on WhatsApp
    </Button>
  );
}
