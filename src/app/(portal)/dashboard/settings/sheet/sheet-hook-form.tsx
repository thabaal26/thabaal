"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { safeAction, toastResult } from "@/components/toast";
import { Button, Field } from "@/components/ui";
import { saveSheetHook } from "../../actions/sheets";

/** A random secret for the Apps Script's SECRET property. */
function newSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Links this business's own live-log script. The saved secret is never sent back to the browser. */
export function SheetHookForm({ linked, source, hasSecret }: { linked: string; source: "own" | "shared" | "none"; hasSecret: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [link, setLink] = useState(linked);
  const [secret, setSecret] = useState("");
  const save = (l: string, sec: string, clear = false) =>
    start(async () => {
      const r = await safeAction(() => saveSheetHook(l, sec, clear));
      toastResult(r);
      if (r.ok) {
        setSecret("");
        router.refresh();
      }
    });
  return (
    <form
      className="space-y-3 rounded-card border border-line bg-panel-2 p-3 sm:p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save(link, secret);
      }}
    >
      {source === "shared" && (
        <p className="text-xs text-muted">
          This business uses the sheet set in the deployment settings. Paste the same /exec link here (with a secret) to make it this business&apos;s own.
        </p>
      )}
      <Field id="hook-url" label="Script web app link" hint="Deploy → Manage deployments → Web app URL, ends in /exec">
        <input
          id="hook-url"
          className="field font-mono sm:text-xs"
          inputMode="url"
          autoComplete="off"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://script.google.com/macros/s/AKfycb…/exec"
        />
      </Field>
      <Field id="hook-secret" label="Secret" hint={hasSecret ? "a secret is saved; type a new one to replace it" : "the same value goes in the script's SECRET property"}>
        <div className="flex gap-2">
          <input
            id="hook-secret"
            className="field min-w-0 flex-1 font-mono sm:text-xs"
            autoComplete="off"
            spellCheck={false}
            value={secret}
            onChange={(e) => setSecret(e.target.value.trim())}
            placeholder={hasSecret ? "•••••••• (saved)" : "Press Generate"}
          />
          <Button type="button" variant="secondary" size="sm" className="self-center" onClick={() => setSecret(newSecret())}>
            Generate
          </Button>
        </div>
      </Field>
      {secret && (
        <p className="text-xs text-ink-2">
          Copy this secret now. In the Apps Script: Project Settings → Script properties → add <b className="font-mono">SECRET</b> with this value. It isn&apos;t shown again after saving.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" loading={pending}>
          Save sheet link
        </Button>
        {linked && (
          <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => save("", "")}>
            Unlink
          </Button>
        )}
      </div>
    </form>
  );
}
