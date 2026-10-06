"use client";

import { Bold, Braces, Eye, Italic, Loader2, Plus, Send, Strikethrough, Trash2, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { MobileActionBar } from "@/components/mobile-action-bar";
import { Sheet } from "@/components/sheet";
import { toastResult } from "@/components/toast";
import { Badge, Button, Card, CardHeader, Label, StatusBadge } from "@/components/ui";
import { PhoneFrame, WhatsAppBubble } from "@/components/whatsapp-preview";
import { cn } from "@/lib/cn";
import {
  CATEGORY_INFO,
  LANGUAGES,
  placeholders,
  renderFor,
  SAMPLE_CUSTOMER,
  validateDraft,
  type Category,
  type TemplateButton,
  type TemplateDraft,
  type VarSource,
} from "@/lib/template";
import { Picker } from "@/components/picker";
import { saveTemplate, sendTestMessage } from "../actions/templates";

const SOURCES: { value: VarSource["source"]; label: string }[] = [
  { value: "name", label: "Customer full name" },
  { value: "first_name", label: "Customer first name" },
  { value: "phone", label: "Customer phone" },
  { value: "static", label: "Fixed text" },
];

const STARTERS: Record<Category, Partial<TemplateDraft>> = {
  MARKETING: {
    headerType: "TEXT",
    headerText: "This week's special ☕",
    body: "Hi {{1}}, enjoy *{{2}}* on your next visit. Show this message at the counter before Sunday.",
    footer: "Reply STOP to unsubscribe",
    buttons: [{ type: "QUICK_REPLY", text: "Interested" }],
    variables: { "1": { source: "first_name" }, "2": { source: "static", value: "20% off" } },
  },
  UTILITY: {
    headerType: "NONE",
    body: "Hi {{1}}, your order is confirmed and will be ready for pickup at {{2}}. Thank you!",
    footer: "",
    buttons: [],
    variables: { "1": { source: "first_name" }, "2": { source: "static", value: "5:30 PM" } },
  },
  AUTHENTICATION: { codeExpiryMins: 10, securityNote: true, buttons: [{ type: "COPY_CODE", text: "Copy code" }] },
};

export function TemplateEditor({
  id,
  initial,
  status,
  statusReason,
  businessName,
  accounts = [],
}: {
  id: string | null;
  initial: TemplateDraft;
  status?: string;
  statusReason?: string | null;
  businessName: string;
  /** The client's WhatsApp Business Accounts; a new template picks one when there are several. */
  accounts?: { id: string; label: string }[];
}) {
  const [t, setT] = useState<TemplateDraft>(initial);
  const [pending, start] = useTransition();
  const [testPhone, setTestPhone] = useState("");
  const [testing, startTest] = useTransition();
  const [previewOpen, setPreviewOpen] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const locked = Boolean(id);
  const auth = t.category === "AUTHENTICATION";

  const set = (patch: Partial<TemplateDraft>) => setT((s) => ({ ...s, ...patch }));
  const errors = useMemo(() => validateDraft(t), [t]);
  const preview = renderFor(t, SAMPLE_CUSTOMER);
  const bodyVars = placeholders(t.body);
  const headerVar = t.headerType === "TEXT" && placeholders(t.headerText).length > 0;

  function wrap(mark: string) {
    const el = bodyRef.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const sel = t.body.slice(a, b) || "text";
    set({ body: t.body.slice(0, a) + mark + sel + mark + t.body.slice(b) });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + mark.length, a + mark.length + sel.length);
    });
  }

  function insertVariable() {
    const el = bodyRef.current;
    const n = (bodyVars.at(-1) ?? 0) + 1;
    const pos = el?.selectionStart ?? t.body.length;
    set({
      body: t.body.slice(0, pos) + `{{${n}}}` + t.body.slice(pos),
      variables: { ...t.variables, [String(n)]: t.variables[String(n)] ?? { source: n === 1 ? "first_name" : "static" } },
    });
  }

  function setVar(key: string, v: VarSource) {
    set({ variables: { ...t.variables, [key]: v } });
  }

  function setButton(i: number, patch: Partial<TemplateButton>) {
    set({ buttons: t.buttons.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  }

  function chooseCategory(c: Category) {
    if (locked) return;
    const pristine = !t.body.trim() || Object.values(STARTERS).some((s) => s.body === t.body);
    set({ category: c, ...(pristine ? { headerText: "", footer: "", ...STARTERS[c] } : {}) });
  }

  function save() {
    start(async () => {
      const r = await saveTemplate(id, t);
      toastResult(r);
      if (r.ok || r.id) {
        router.push(r.id && !id ? `/dashboard/templates/${r.id}` : "/dashboard/templates");
        router.refresh();
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        {status && (status === "REJECTED" || statusReason) && (
          <div className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">{status === "REJECTED" ? "Meta rejected this template" : "Meta returned an error"}</p>
              {statusReason && <p className="mt-0.5 text-rose-700">{statusReason}</p>}
              <p className="mt-1 text-rose-700">Edit the content below and save to resubmit.</p>
            </div>
          </div>
        )}

        <Card>
          <CardHeader title="Basics" description={locked ? "Meta doesn't allow the name, language or category to change after submission." : "Meta reviews every template before it can be sent."} />
          <div className="space-y-5 p-5">
            <div>
              <Label>Category</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                {(Object.keys(CATEGORY_INFO) as Category[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    disabled={locked && c !== t.category}
                    onClick={() => chooseCategory(c)}
                    className={cn(
                      "rounded-xl border p-3 text-left transition disabled:opacity-40",
                      t.category === c ? "border-brand bg-brand-soft/60 ring-4 ring-brand/10" : "border-line hover:border-ink/20",
                    )}
                  >
                    <p className="text-sm font-medium">{CATEGORY_INFO[c].label}</p>
                    <p className="mt-0.5 text-xs text-muted">{CATEGORY_INFO[c].hint}</p>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
              {accounts.length > 1 && (
                <div className="sm:col-span-2">
                  <Label htmlFor="waba" hint="templates are approved per WhatsApp account">WhatsApp account</Label>
                  <Picker
                    id="waba"
                    title="WhatsApp account"
                    value={t.businessAccountId ?? accounts[0].id}
                    disabled={locked}
                    onChange={(businessAccountId) => set({ businessAccountId })}
                    options={accounts.map((a) => ({ value: a.id, label: a.label }))}
                  />
                </div>
              )}
              <div>
                <Label htmlFor="name" hint="lowercase_with_underscores">Template name</Label>
                <input
                  id="name"
                  className="field font-mono"
                  value={t.name}
                  disabled={locked}
                  placeholder="weekend_offer"
                  onChange={(e) => set({ name: e.target.value.toLowerCase().replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, "") })}
                />
              </div>
              <div>
                <Label htmlFor="lang">Language</Label>
                <Picker
                  id="lang"
                  title="Language"
                  value={t.language}
                  disabled={locked}
                  onChange={(language) => set({ language })}
                  options={[
                    ...LANGUAGES.map((l) => ({ value: l.code, label: l.label, hint: l.code })),
                    ...(LANGUAGES.some((l) => l.code === t.language) ? [] : [{ value: t.language, label: t.language }]),
                  ]}
                />
              </div>
            </div>
          </div>
        </Card>

        {auth ? (
          <Card>
            <CardHeader title="Passcode message" description="Meta writes the text for authentication templates. You choose these options." />
            <div className="space-y-4 p-5">
              <label className="flex items-center gap-3 text-sm">
                <input type="checkbox" className="size-4 accent-brand" checked={t.securityNote} onChange={(e) => set({ securityNote: e.target.checked })} />
                Add &ldquo;For your security, do not share this code.&rdquo;
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="exp" hint="1–90, optional">Code expires after (minutes)</Label>
                  <input id="exp" type="number" min={1} max={90} className="field" value={t.codeExpiryMins ?? ""} onChange={(e) => set({ codeExpiryMins: e.target.value ? Number(e.target.value) : null })} />
                </div>
                <div>
                  <Label htmlFor="copy">Copy button label</Label>
                  <input id="copy" className="field" maxLength={25} value={t.buttons[0]?.text ?? "Copy code"} onChange={(e) => set({ buttons: [{ type: "COPY_CODE", text: e.target.value }] })} />
                </div>
              </div>
              <p className="rounded-lg bg-canvas p-3 text-xs text-muted">Authentication templates are sent by your website or app during login, so they can&apos;t be used in campaigns.</p>
            </div>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader title="Content" />
              <div className="space-y-5 p-5">
                <div>
                  <Label>Header</Label>
                  <div className="mb-3 inline-flex rounded-lg bg-canvas p-1">
                    {(["NONE", "TEXT", "IMAGE"] as const).map((h) => (
                      <button key={h} type="button" onClick={() => set({ headerType: h })} className={cn("rounded-md px-4 py-2 text-sm font-medium transition sm:px-3 sm:py-1 sm:text-xs", t.headerType === h ? "bg-white text-ink shadow-sm" : "text-muted")}>
                        {h === "NONE" ? "None" : h === "TEXT" ? "Text" : "Image"}
                      </button>
                    ))}
                  </div>
                  {t.headerType === "TEXT" && (
                    <input className="field" maxLength={60} value={t.headerText} placeholder="Headline, optionally with {{1}}" onChange={(e) => set({ headerText: e.target.value })} />
                  )}
                  {t.headerType === "IMAGE" && (
                    <input className="field" value={t.headerMediaUrl} placeholder="https://yourdomain.com/offer.jpg" onChange={(e) => set({ headerMediaUrl: e.target.value })} />
                  )}
                </div>

                <div>
                  <Label htmlFor="body" hint={`${t.body.length}/1024`}>Message</Label>
                  <div className="overflow-hidden rounded-lg border border-line focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/12">
                    <div className="flex items-center gap-0.5 border-b border-line bg-canvas/60 px-1.5 py-1">
                      {[
                        { m: "*", I: Bold, l: "Bold" },
                        { m: "_", I: Italic, l: "Italic" },
                        { m: "~", I: Strikethrough, l: "Strikethrough" },
                      ].map(({ m, I, l }) => (
                        <button key={l} type="button" title={l} onClick={() => wrap(m)} className="grid size-10 place-items-center rounded-lg text-ink-2 hover:bg-white sm:size-7 sm:rounded">
                          <I className="size-3.5" />
                        </button>
                      ))}
                      <span className="mx-1 h-4 w-px bg-line" />
                      <button type="button" onClick={insertVariable} className="flex h-10 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-brand-deep hover:bg-white sm:h-7 sm:rounded sm:px-2 sm:text-xs">
                        <Braces className="size-3.5" /> Add variable
                      </button>
                    </div>
                    <textarea
                      id="body"
                      ref={bodyRef}
                      rows={6}
                      maxLength={1024}
                      value={t.body}
                      onChange={(e) => set({ body: e.target.value })}
                      className="block w-full resize-y px-3.5 py-3 text-base outline-none sm:px-3 sm:py-2.5 sm:text-sm"
                      placeholder="Hi {{1}}, …"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="footer" hint={`${t.footer.length}/60 · optional`}>Footer</Label>
                  <input id="footer" className="field" maxLength={60} value={t.footer} placeholder="Reply STOP to unsubscribe" onChange={(e) => set({ footer: e.target.value })} />
                </div>
              </div>
            </Card>

            {(bodyVars.length > 0 || headerVar) && (
              <Card>
                <CardHeader title="Personalisation" description="What each variable is filled with when the message is sent." />
                <div className="divide-y divide-line">
                  {[...(headerVar ? ["h1"] : []), ...bodyVars.map(String)].map((key) => {
                    const v = t.variables[key] ?? { source: "name" };
                    return (
                      <div key={key} className="grid items-center gap-3 px-5 py-3 sm:grid-cols-[110px_1fr_1fr]">
                        <span className="font-mono text-xs text-ink-2">{key === "h1" ? "Header {{1}}" : `{{${key}}}`}</span>
                        <Picker
                          title={`What fills ${key === "h1" ? "the header variable" : `{{${key}}}`}`}
                          value={v.source}
                          onChange={(source) => setVar(key, { ...v, source: source as VarSource["source"] })}
                          options={SOURCES.map((s) => ({ value: s.value, label: s.label }))}
                        />
                        {v.source === "static" ? (
                          <input className="field" placeholder="Text to insert" value={v.value ?? ""} onChange={(e) => setVar(key, { ...v, value: e.target.value })} />
                        ) : (
                          <span className="text-xs text-muted">e.g. {preview.bodyParams[bodyVars.indexOf(Number(key))] ?? preview.headerParams[0]}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            <Card>
              <CardHeader
                title="Buttons"
                description="Optional. Up to 10: quick replies, 2 website links and 1 call button."
                action={
                  <div className="flex gap-1">
                    {(
                      [
                        ["QUICK_REPLY", "Reply"],
                        ["URL", "Link"],
                        ["PHONE_NUMBER", "Call"],
                      ] as const
                    ).map(([type, l]) => (
                      <Button key={type} size="sm" variant="secondary" disabled={t.buttons.length >= 10} onClick={() => set({ buttons: [...t.buttons, { type, text: "" }] })}>
                        <Plus className="size-3" /> {l}
                      </Button>
                    ))}
                  </div>
                }
              />
              {t.buttons.length ? (
                <div className="divide-y divide-line">
                  {t.buttons.map((b, i) => (
                    <div key={i} className="grid items-center gap-2 px-5 py-3 sm:grid-cols-[80px_1fr_1.3fr_auto]">
                      <Badge tone={b.type === "URL" ? "blue" : b.type === "PHONE_NUMBER" ? "green" : "gray"}>
                        {b.type === "URL" ? "Link" : b.type === "PHONE_NUMBER" ? "Call" : "Reply"}
                      </Badge>
                      <input className="field" maxLength={25} placeholder="Button label" value={b.text} onChange={(e) => setButton(i, { text: e.target.value })} />
                      {b.type === "URL" ? (
                        <input className="field" placeholder="https://…" value={b.url ?? ""} onChange={(e) => setButton(i, { url: e.target.value })} />
                      ) : b.type === "PHONE_NUMBER" ? (
                        <input className="field" placeholder="+91 98765 43210" value={b.phone ?? ""} onChange={(e) => setButton(i, { phone: e.target.value })} />
                      ) : (
                        <span />
                      )}
                      <button type="button" title="Remove" onClick={() => set({ buttons: t.buttons.filter((_, j) => j !== i) })} className="grid size-11 place-items-center justify-self-end rounded-lg text-muted hover:bg-rose-50 hover:text-rose-600 sm:size-8">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-5 py-4 text-sm text-muted">No buttons.</p>
              )}
            </Card>
          </>
        )}
      </div>

      <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <div className="hidden space-y-4 lg:block">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">Live preview</p>
            {status && <StatusBadge status={status} />}
          </div>
          <PhoneFrame name={businessName}>
          <WhatsAppBubble
            header={preview.header}
            headerImage={!auth && t.headerType === "IMAGE" ? t.headerMediaUrl || null : undefined}
            body={preview.body}
            footer={preview.footer}
            buttons={t.buttons}
          />
        </PhoneFrame>
          <p className="text-center text-xs text-muted">Previewed for {SAMPLE_CUSTOMER.name}</p>
        </div>

        {errors.length > 0 && (
          <ul className="space-y-1 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
            {errors.map((e) => (
              <li key={e} className="flex gap-2"><TriangleAlert className="mt-px size-3.5 shrink-0" />{e}</li>
            ))}
          </ul>
        )}

        <div className="hidden lg:block">
          <Button className="w-full" disabled={pending || errors.length > 0} onClick={save}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : id ? "Save changes" : "Create template"}
          </Button>
        </div>

        {id && !auth && (
          <Card className="p-4">
            <Label htmlFor="test">Send a test</Label>
            <div className="flex gap-2">
              <input id="test" type="tel" inputMode="tel" autoComplete="tel" className="field" placeholder="+91 98765 43210" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} />
              <Button
                variant="secondary"
                aria-label="Send test"
                disabled={testing || !testPhone}
                onClick={() => startTest(async () => toastResult(await sendTestMessage(id, testPhone)))}
              >
                {testing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </Button>
            </div>
          </Card>
        )}
      </div>

      {/* Phones: save and preview stay under the thumb instead of at the end of a long form. */}
      <MobileActionBar>
        <Button variant="secondary" className="flex-1" onClick={() => setPreviewOpen(true)}>
          <Eye className="size-4" /> Preview
        </Button>
        <Button className="flex-[1.4]" disabled={pending || errors.length > 0} onClick={save}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : errors.length ? `Fix ${errors.length} issue${errors.length > 1 ? "s" : ""}` : id ? "Save changes" : "Create template"}
        </Button>
      </MobileActionBar>
      <Sheet open={previewOpen} onClose={() => setPreviewOpen(false)} title="Preview" className="bg-canvas">
        <PhoneFrame name={businessName}>
          <WhatsAppBubble
            header={preview.header}
            headerImage={!auth && t.headerType === "IMAGE" ? t.headerMediaUrl || null : undefined}
            body={preview.body}
            footer={preview.footer}
            buttons={t.buttons}
          />
        </PhoneFrame>
        <p className="mt-3 text-center text-xs text-muted">Previewed for {SAMPLE_CUSTOMER.name}</p>
      </Sheet>
    </div>
  );
}
