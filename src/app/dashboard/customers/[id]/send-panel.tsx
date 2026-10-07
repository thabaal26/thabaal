"use client";

import { Loader2, MessageSquareText, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toastResult } from "@/components/toast";
import { Button, Card, CardHeader, Label } from "@/components/ui";
import { renderFor, type TemplateButton, type VarMap } from "@/lib/template";
import { replyToCustomer, sendToCustomer } from "../../actions/send";

export type PanelTemplate = {
  id: string;
  name: string;
  category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  headerType: "NONE" | "TEXT" | "IMAGE";
  headerText: string | null;
  headerMediaUrl: string | null;
  body: string;
  footer: string | null;
  variables: unknown;
  buttons: unknown;
  codeExpiryMins: number | null;
  securityNote: boolean;
  businessAccountId: string | null;
};
export type PanelNumber = { id: string; label: string; businessAccountId: string };

/** Send one template to this customer, or type a reply while their 24-hour window is open. */
export function SendPanel({
  customer,
  templates,
  numbers,
  canSend,
  windowEndsAt,
  blocked,
}: {
  customer: { id: string; name: string; phone: string };
  templates: PanelTemplate[];
  numbers: PanelNumber[];
  /** Admins can send templates; client logins can only reply. */
  canSend: boolean;
  /** When the customer's last message turns 24 hours old; null if they haven't written or it has passed. */
  windowEndsAt: string | null;
  /** Why sending is off for this customer (opted out, unreachable), if it is. */
  blocked: string | null;
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [senderId, setSenderId] = useState(numbers[0]?.id ?? "");
  const [text, setText] = useState("");
  const [sending, startSend] = useTransition();
  const [replying, startReply] = useTransition();

  const t = templates.find((x) => x.id === templateId);
  // Meta only sends a template from numbers in the account that approved it.
  const usable = numbers.filter((n) => !t?.businessAccountId || n.businessAccountId === t.businessAccountId);
  const sender = usable.some((n) => n.id === senderId) ? senderId : (usable[0]?.id ?? "");
  const preview = t && renderFor({ ...t, headerText: t.headerText ?? "", footer: t.footer ?? "", variables: t.variables as VarMap }, customer);
  const buttons = (t?.buttons ?? []) as TemplateButton[];
  const windowOpen = windowEndsAt !== null;

  const send = (force: boolean): void =>
    startSend(async () => {
      const r = await sendToCustomer(customer.id, templateId, sender || null, force);
      if (r.soft && window.confirm(r.message)) return send(true);
      if (!r.soft) toastResult(r);
      router.refresh();
    });

  return (
    <Card className="mt-6">
      <CardHeader title={`Message ${customer.name}`} description="Send one message to this customer now, from your portal." />
      <div className="grid gap-6 p-4 sm:p-5 lg:grid-cols-2">
        {canSend && (
          <div className="space-y-3">
            <p className="flex items-center gap-1.5 text-sm font-medium"><Send className="size-4 text-brand" /> Send a template</p>
            {blocked ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{blocked}</p>
            ) : templates.length ? (
              <>
                <div>
                  <Label htmlFor="tpl">Template</Label>
                  <select id="tpl" className="field" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                    {templates.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.category.toLowerCase()}</option>)}
                  </select>
                </div>
                {numbers.length > 0 && (
                  <div>
                    <Label htmlFor="snd">Send from</Label>
                    <select id="snd" className="field" value={sender} onChange={(e) => setSenderId(e.target.value)}>
                      {usable.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
                    </select>
                  </div>
                )}
                {preview && (
                  <div className="rounded-xl bg-[#d9fdd3] px-3 py-2 text-sm shadow-sm">
                    {t?.headerType === "IMAGE" && <p className="mb-1 text-xs text-muted">[image header]</p>}
                    {preview.header && <p className="font-semibold">{preview.header}</p>}
                    <p className="whitespace-pre-wrap">{preview.body}</p>
                    {preview.footer && <p className="mt-1 text-xs text-muted">{preview.footer}</p>}
                    {buttons.length > 0 && <p className="mt-2 border-t border-black/10 pt-1.5 text-xs text-brand-deep">{buttons.map((b) => b.text).join(" · ")}</p>}
                  </div>
                )}
                <Button className="w-full" disabled={sending || !templateId} onClick={() => send(false)}>
                  {sending ? <Loader2 className="size-4 animate-spin" /> : <><Send className="size-4" /> Send to {customer.name.split(" ")[0]}</>}
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted">No approved templates yet. Templates appear here once Meta approves them.</p>
            )}
          </div>
        )}

        <div className="space-y-3" id="reply">
          <p className="flex items-center gap-1.5 text-sm font-medium"><MessageSquareText className="size-4 text-brand" /> Type a reply</p>
          {windowOpen ? (
            <>
              <p className="text-xs text-muted">They wrote to you recently, so you can reply freely until {windowEndsAt}.</p>
              <textarea className="field min-h-28" maxLength={4000} placeholder={`Reply to ${customer.name}…`} value={text} onChange={(e) => setText(e.target.value)} />
              <Button
                className="w-full"
                disabled={replying || !text.trim()}
                onClick={() =>
                  startReply(async () => {
                    const r = await replyToCustomer(customer.id, text);
                    toastResult(r);
                    if (r.ok) setText("");
                    router.refresh();
                  })
                }
              >
                {replying ? <Loader2 className="size-4 animate-spin" /> : <><Send className="size-4" /> Send reply</>}
              </Button>
            </>
          ) : (
            <p className="rounded-lg bg-canvas px-3 py-2 text-sm text-muted">
              Typed messages need the customer to have written to you in the last 24 hours. Until then, send a template.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
