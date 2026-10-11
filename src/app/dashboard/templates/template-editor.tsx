"use client";

import { Bold, Braces, Eye, ImageIcon, Italic, Plus, Send, Strikethrough, Trash2, TriangleAlert, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { MobileActionBar } from "@/components/mobile-action-bar";
import { Sheet } from "@/components/sheet";
import { toastResult } from "@/components/toast";
import { Badge, Button, buttonClass, Callout, Card, CardHeader, CheckRow, Field, Label, Segmented, Spinner, StatusBadge } from "@/components/ui";
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
  { value: "location", label: "Customer area / location" },
  { value: "purchases", label: "What they bought" },
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

  // Header image goes straight from the browser to Vercel Blob; its public link fills the field.
  const [uploading, setUploading] = useState(false);
  async function uploadImage(file?: File) {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) return toastResult({ ok: false, message: "That image is over 4 MB. Use a smaller JPG or PNG." });
    setUploading(true);
    const timeout = AbortSignal.timeout(60_000);
    try {
      const res = await fetch(`/api/upload?filename=${encodeURIComponent(file.name)}`, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
        signal: timeout,
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? `Server returned ${res.status}`);
      set({ headerMediaUrl: data.url });
      toastResult({ ok: true, message: "Image uploaded. Save the template to keep it." });
    } catch (e) {
      console.error("Image upload failed", e);
      const message = timeout.aborted ? "Upload timed out. Try again, or paste an image link instead." : `Upload failed: ${e instanceof Error ? e.message : String(e)}`;
      toastResult({ ok: false, message });
    } finally {
      setUploading(false);
    }
  }
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
    if (pending) return;
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
    <div className="grid items-start gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="space-y-4 sm:space-y-6">
        {status && (status === "REJECTED" || statusReason) && (
          <Callout tone="danger" role="alert" icon={<TriangleAlert />} title={status === "REJECTED" ? "Meta rejected this template" : "Meta returned an error"}>
            {statusReason && <p>{statusReason}</p>}
            <p className="mt-1">Edit the content below and save to resubmit.</p>
          </Callout>
        )}

        <Card>
          <CardHeader title="Basics" description={locked ? "Meta doesn't allow the name, language or category to change after submission." : "Meta reviews every template before it can be sent."} />
          <div className="space-y-5 p-4 sm:p-5">
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-ink-2">Category</legend>
              <div role="radiogroup" aria-label="Category" className="grid gap-2 sm:grid-cols-3">
                {(Object.keys(CATEGORY_INFO) as Category[]).map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={t.category === c}
                    disabled={locked && c !== t.category}
                    title={locked && c !== t.category ? "Meta doesn't allow the category to change after submission" : undefined}
                    onClick={() => chooseCategory(c)}
                    className={cn(
                      "rounded-control border p-3 text-left transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50",
                      t.category === c ? "border-brand bg-brand-soft" : "border-line-strong/50 bg-panel hover:border-line-strong",
                    )}
                  >
                    <p className={cn("text-sm font-medium", t.category === c ? "text-brand-deep" : "text-ink")}>{CATEGORY_INFO[c].label}</p>
                    <p className={cn("mt-0.5 text-xs", t.category === c ? "text-brand-deep" : "text-muted")}>{CATEGORY_INFO[c].hint}</p>
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_13rem]">
              {accounts.length > 1 && (
                <div className="sm:col-span-2">
                  <Label htmlFor="waba" hint="approved per WhatsApp account">WhatsApp account</Label>
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
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
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
            <div className="space-y-4 p-4 sm:p-5">
              <CheckRow label={<>Add &ldquo;For your security, do not share this code.&rdquo;</>} checked={t.securityNote} onChange={(e) => set({ securityNote: e.target.checked })} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="exp" label="Code expires after (minutes)" hint="1–90, optional">
                  <input type="number" inputMode="numeric" min={1} max={90} className="field tabular" value={t.codeExpiryMins ?? ""} onChange={(e) => set({ codeExpiryMins: e.target.value ? Number(e.target.value) : null })} />
                </Field>
                <Field id="copy" label="Copy button label">
                  <input className="field" maxLength={25} value={t.buttons[0]?.text ?? "Copy code"} onChange={(e) => set({ buttons: [{ type: "COPY_CODE", text: e.target.value }] })} />
                </Field>
              </div>
              <p className="rounded-control bg-sunken p-3 text-xs text-muted">Authentication templates are sent by your website or app during login, so they can&apos;t be used in campaigns.</p>
            </div>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader title="Content" />
              <div className="space-y-5 p-4 sm:p-5">
                <div>
                  <p id="header-label" className="mb-1.5 text-sm font-medium text-ink-2">Header</p>
                  <Segmented
                    label="Header"
                    value={t.headerType}
                    onChange={(headerType) => set({ headerType })}
                    options={[
                      { value: "NONE", label: "None" },
                      { value: "TEXT", label: "Text" },
                      { value: "IMAGE", label: "Image" },
                    ]}
                    className="mb-3"
                  />
                  {t.headerType === "TEXT" && (
                    <input className="field" maxLength={60} value={t.headerText} placeholder="Headline, optionally with {{1}}" aria-labelledby="header-label" onChange={(e) => set({ headerText: e.target.value })} />
                  )}
                  {t.headerType === "IMAGE" && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-control bg-sunken ring-1 ring-line">
                          {t.headerMediaUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element -- any URL the admin enters
                            <img src={t.headerMediaUrl} alt="Header image" className="size-full object-cover" />
                          ) : (
                            <ImageIcon aria-label="No image yet" className="size-5 text-muted" />
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <label className={cn(buttonClass("secondary", "sm"), "cursor-pointer has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand-deep", uploading && "pointer-events-none opacity-60")}>
                            {uploading ? <Spinner /> : <Upload aria-hidden className="size-4" />}
                            {uploading ? "Uploading…" : t.headerMediaUrl ? "Replace image" : "Upload image"}
                            <input type="file" accept="image/jpeg,image/png" className="sr-only" onChange={(e) => { uploadImage(e.target.files?.[0]); e.target.value = ""; }} />
                          </label>
                          {t.headerMediaUrl && !uploading && (
                            <button type="button" className={buttonClass("ghost", "sm")} onClick={() => set({ headerMediaUrl: "" })}>Remove</button>
                          )}
                        </div>
                      </div>
                      {!t.headerMediaUrl && (
                        <p className="flex items-center gap-1.5 text-xs text-warning">
                          <TriangleAlert aria-hidden className="size-3.5 shrink-0" /> Add an image: WhatsApp rejects image-header messages sent without one.
                        </p>
                      )}
                      <input className="field sm:text-xs" inputMode="url" value={t.headerMediaUrl} placeholder="…or paste an image link: https://yourdomain.com/offer.jpg" onChange={(e) => set({ headerMediaUrl: e.target.value })} aria-label="Image link" />
                      <p className="text-xs text-muted">JPG or PNG, up to 4 MB. A wide image (about 1200×628) reads best in the chat.</p>
                    </div>
                  )}
                </div>

                <div>
                  <Label htmlFor="body" hint={`${t.body.length}/1024`}>Message</Label>
                  <div className="overflow-hidden rounded-control border border-line-strong focus-within:border-brand-deep focus-within:outline-2 focus-within:outline-brand-deep">
                    <div role="toolbar" aria-label="Formatting" className="flex items-center gap-0.5 border-b border-line bg-sunken px-1.5 py-1">
                      {[
                        { m: "*", I: Bold, l: "Bold" },
                        { m: "_", I: Italic, l: "Italic" },
                        { m: "~", I: Strikethrough, l: "Strikethrough" },
                      ].map(({ m, I, l }) => (
                        <button key={l} type="button" title={l} aria-label={l} onClick={() => wrap(m)} className="grid size-11 shrink-0 place-items-center rounded-control text-ink-2 transition hover:bg-panel active:bg-panel sm:size-8 sm:pointer-coarse:size-11">
                          <I aria-hidden className="size-4" />
                        </button>
                      ))}
                      <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-line-strong/40" />
                      <button type="button" onClick={insertVariable} className="flex h-11 shrink-0 items-center gap-1.5 rounded-control px-2.5 text-sm font-medium text-brand-deep transition hover:bg-panel active:bg-panel sm:h-8 sm:pointer-coarse:h-11">
                        <Braces aria-hidden className="size-4" /> Add variable
                      </button>
                    </div>
                    <textarea
                      id="body"
                      ref={bodyRef}
                      rows={6}
                      maxLength={1024}
                      value={t.body}
                      onChange={(e) => set({ body: e.target.value })}
                      className="block w-full resize-y bg-panel px-3.5 py-3 text-base leading-relaxed text-ink outline-none placeholder:text-muted sm:px-3 sm:py-2.5 sm:text-sm"
                      placeholder="Hi {{1}}, …"
                    />
                  </div>
                </div>

                <Field id="footer" label="Footer" hint={`${t.footer.length}/60 · optional`}>
                  <input className="field" maxLength={60} value={t.footer} placeholder="Reply STOP to unsubscribe" onChange={(e) => set({ footer: e.target.value })} />
                </Field>
              </div>
            </Card>

            {(bodyVars.length > 0 || headerVar) && (
              <Card>
                <CardHeader title="Personalisation" description="What each variable is filled with when the message is sent." />
                <div className="divide-y divide-line">
                  {[...(headerVar ? ["h1"] : []), ...bodyVars.map(String)].map((key) => {
                    const v = t.variables[key] ?? { source: "name" };
                    return (
                      <div key={key} className="grid items-center gap-2 px-4 py-3 sm:grid-cols-[7rem_1fr_1fr] sm:gap-3 sm:px-5">
                        <span className="font-mono text-sm font-medium text-ink-2">{key === "h1" ? "Header {{1}}" : `{{${key}}}`}</span>
                        <Picker
                          title={`What fills ${key === "h1" ? "the header variable" : `{{${key}}}`}`}
                          value={v.source}
                          onChange={(source) => setVar(key, { ...v, source: source as VarSource["source"] })}
                          options={SOURCES.map((s) => ({ value: s.value, label: s.label }))}
                        />
                        {v.source === "static" ? (
                          <input className="field" placeholder="Text to insert" aria-label={`Text for ${key === "h1" ? "the header variable" : `{{${key}}}`}`} value={v.value ?? ""} onChange={(e) => setVar(key, { ...v, value: e.target.value })} />
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
                description="Optional. Up to 10: quick replies, 2 website links, 1 call button, or a single Catalogue / Review & pay button."
                action={
                  <div className="flex flex-wrap gap-1.5">
                    {(
                      [
                        ["QUICK_REPLY", "Reply"],
                        ["URL", "Link"],
                        ["PHONE_NUMBER", "Call"],
                        ["CATALOG", "Catalogue"],
                        ["ORDER_DETAILS", "Review & pay"],
                      ] as const
                    ).map(([type, l]) => {
                      const hasSingleOnly = t.buttons.some((b) => b.type === "CATALOG" || b.type === "ORDER_DETAILS");
                      return (
                        <Button
                          key={type}
                          size="sm"
                          variant="secondary"
                          disabled={t.buttons.length >= 10 || hasSingleOnly}
                          title={hasSingleOnly ? "Catalogue and Review & pay buttons must be the only button on a template" : undefined}
                          onClick={() =>
                            // WhatsApp allows a catalogue button only on its own, with no header.
                            type === "CATALOG"
                              ? set({ buttons: [{ type, text: "View catalog" }], headerType: "NONE", category: "MARKETING" })
                              : type === "ORDER_DETAILS"
                                ? set({ buttons: [{ type, text: "Review and pay" }] })
                                : set({ buttons: [...t.buttons, { type, text: "" }] })
                          }
                        >
                          <Plus aria-hidden className="size-3.5" /> {l}
                        </Button>
                      );
                    })}
                  </div>
                }
              />
              {t.buttons.length ? (
                <div className="divide-y divide-line">
                  {t.buttons.map((b, i) => (
                    <div key={i} className="grid grid-cols-[1fr_auto] items-center gap-2 px-4 py-3 sm:grid-cols-[6rem_1fr_1.3fr_auto] sm:px-5">
                      <Badge tone={b.type === "URL" ? "blue" : b.type === "PHONE_NUMBER" || b.type === "CATALOG" || b.type === "ORDER_DETAILS" ? "green" : "gray"}>
                        {b.type === "URL" ? "Link" : b.type === "PHONE_NUMBER" ? "Call" : b.type === "CATALOG" ? "Catalogue" : b.type === "ORDER_DETAILS" ? "Review & pay" : "Reply"}
                      </Badge>
                      <input className="field max-sm:col-span-2" maxLength={25} placeholder="Button label" aria-label={`Button ${i + 1} label`} value={b.text} onChange={(e) => setButton(i, { text: e.target.value })} />
                      {b.type === "URL" ? (
                        <input className="field max-sm:col-span-2" inputMode="url" placeholder="https://…" aria-label={`Button ${i + 1} link`} value={b.url ?? ""} onChange={(e) => setButton(i, { url: e.target.value })} />
                      ) : b.type === "PHONE_NUMBER" ? (
                        <input className="field max-sm:col-span-2" type="tel" inputMode="tel" placeholder="+91 98765 43210" aria-label={`Button ${i + 1} phone number`} value={b.phone ?? ""} onChange={(e) => setButton(i, { phone: e.target.value })} />
                      ) : b.type === "CATALOG" ? (
                        <input className="field max-sm:col-span-2 font-mono text-xs" placeholder="Thumbnail SKU (optional, e.g. THN-006)" aria-label="Catalogue thumbnail product SKU" value={b.thumbnailProductId ?? ""} onChange={(e) => setButton(i, { thumbnailProductId: e.target.value })} />
                      ) : (
                        <span className="max-sm:hidden" />
                      )}
                      <button type="button" title="Remove" aria-label={`Remove button ${i + 1}`} onClick={() => set({ buttons: t.buttons.filter((_, j) => j !== i) })} className="col-start-2 row-start-1 grid size-11 place-items-center justify-self-end rounded-control text-muted transition hover:bg-danger-bg hover:text-danger sm:col-start-auto sm:row-start-auto sm:size-8 sm:pointer-coarse:size-11">
                        <Trash2 aria-hidden className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-4 py-4 text-sm text-muted sm:px-5">No buttons.</p>
              )}
            </Card>
          </>
        )}
      </div>

      <aside aria-label="Preview and save" className="space-y-4 lg:sticky lg:top-8">
        <div className="hidden space-y-4 lg:block">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">Live preview</h2>
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
          <div role="status" className="rounded-card border border-warning-border bg-warning-bg p-3 text-sm text-warning">
            <p className="mb-1 font-semibold">Fix before saving</p>
            <ul className="space-y-1 text-xs">
              {errors.map((e) => (
                <li key={e} className="flex gap-2">
                  <TriangleAlert aria-hidden className="mt-px size-3.5 shrink-0" />
                  {e}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="hidden lg:block">
          <Button className="w-full" disabled={errors.length > 0} loading={pending} onClick={save}>
            {id ? "Save changes" : "Create template"}
          </Button>
        </div>

        {id && (
          <Card className="p-4">
            <Label htmlFor="test">{auth ? "Send a test OTP" : "Send a test"}</Label>
            <div className="flex gap-2">
              <input id="test" type="tel" inputMode="tel" autoComplete="tel" className="field" placeholder="+91 98765 43210" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} />
              <Button
                variant="secondary"
                icon
                aria-label="Send test"
                className="shrink-0 sm:size-10"
                disabled={!testPhone}
                loading={testing}
                onClick={() => startTest(async () => toastResult(await sendTestMessage(id, testPhone)))}
              >
                <Send aria-hidden className="size-4" />
              </Button>
            </div>
          </Card>
        )}
      </aside>


      {/* Phones: save and preview stay under the thumb instead of at the end of a long form. */}
      <MobileActionBar>
        <Button variant="secondary" className="flex-1" onClick={() => setPreviewOpen(true)}>
          <Eye aria-hidden className="size-4" /> Preview
        </Button>
        <Button className="!flex-[1.4]" disabled={errors.length > 0} loading={pending} onClick={save}>
          {errors.length ? `Fix ${errors.length} issue${errors.length > 1 ? "s" : ""}` : id ? "Save changes" : "Create template"}
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
