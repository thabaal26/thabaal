"use client";

// Tells the server which portal section was opened (app/api/usage), once per page, for the admin panel's Usage
// page. Sends only the address path; the server decides whether the login is one that counts.

import { usePathname } from "next/navigation";
import { useEffect } from "react";

export function UsageBeacon() {
  const path = usePathname();
  useEffect(() => {
    if (!path) return;
    const body = JSON.stringify({ path });
    try {
      if (!navigator.sendBeacon?.("/api/usage", new Blob([body], { type: "application/json" })))
        void fetch("/api/usage", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
    } catch {
      // Counting is never worth an error on screen.
    }
  }, [path]);
  return null;
}
