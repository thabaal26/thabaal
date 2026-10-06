"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { normalizePhone } from "@/lib/phone";
import { requireAdmin } from "@/lib/session";
import { deliver, getSettings, readiness, templateSendable } from "@/lib/provider";
import {
  fromMetaComponents,
  toMetaComponents,
  validateDraft,
  type TemplateDraft,
} from "@/lib/template";
import {
  createMetaTemplate,
  deleteMetaTemplate,
  editMetaTemplate,
  listMetaTemplates,
  mapMetaStatus,
  MetaError,
  uploadHeaderSample,
  waConfig,
  type WaConfig,
} from "@/lib/whatsapp";

export type ActionResult = { ok: boolean; message?: string; errors?: string[]; id?: string };

const errText = (e: unknown) => (e instanceof MetaError || e instanceof Error ? e.message : "Something went wrong");

function contentFields(d: TemplateDraft) {
  const auth = d.category === "AUTHENTICATION";
  return {
    headerType: auth ? "NONE" : d.headerType,
    headerText: !auth && d.headerType === "TEXT" ? d.headerText.trim() : null,
    headerMediaUrl: !auth && d.headerType === "IMAGE" ? d.headerMediaUrl.trim() : null,
    body: auth ? "" : d.body.trim(),
    footer: auth ? null : d.footer.trim() || null,
    buttons: auth ? [{ type: "COPY_CODE", text: d.buttons[0]?.text || "Copy code" }] : d.buttons,
    variables: d.variables,
    codeExpiryMins: auth ? d.codeExpiryMins : null,
    securityNote: auth ? d.securityNote : false,
  } as const;
}

async function metaComponents(cfg: WaConfig, d: TemplateDraft) {
  const handle = d.category !== "AUTHENTICATION" && d.headerType === "IMAGE" ? await uploadHeaderSample(cfg, d.headerMediaUrl) : undefined;
  return toMetaComponents(d, handle);
}

/** The WhatsApp account a client's templates live in. */
async function clientWa(clientId: string) {
  return waConfig(await db.client.findUnique({ where: { id: clientId } }));
}

export async function saveTemplate(id: string | null, draft: TemplateDraft): Promise<ActionResult> {
  const s = id ? await requireAdmin() : await requireAdmin(true);
  if ("denied" in s) return { ok: false, message: s.denied };
  const errors = validateDraft(draft);
  if (errors.length) return { ok: false, errors };
  const owner = id ? await db.template.findUnique({ where: { id }, select: { clientId: true } }) : null;
  if (id && !owner) return { ok: false, message: "Template not found." };
  const clientId = owner?.clientId ?? s.clientId!;
  const cfg = await clientWa(clientId);
  const { live } = cfg;
  const sameName = { clientId_name_language: { clientId, name: draft.name, language: draft.language } };

  // Local session: no Meta review. A template Meta had approved no longer matches, so it
  // goes back to draft and is resubmitted the next time it's saved with Meta active.
  if ((await getSettings()).provider === "LOCAL") {
    if (id) {
      const existing = await db.template.findUnique({ where: { id } });
      if (!existing) return { ok: false, message: "Template not found." };
      const merged = { ...draft, name: existing.name, language: existing.language, category: existing.category };
      await db.template.update({
        where: { id },
        data: {
          ...contentFields(merged),
          ...(existing.metaId && { status: "DRAFT", statusReason: "Changed in local mode. Save it again with Meta active to resubmit." }),
        },
      });
      revalidatePath("/dashboard/templates");
      return { ok: true, id, message: "Saved. The local session sends the new version from the next batch." };
    }
    if (await db.template.findUnique({ where: sameName })) {
      return { ok: false, errors: ["A template with this name and language already exists."] };
    }
    const created = await db.template.create({
      data: { clientId, name: draft.name, language: draft.language, category: draft.category, ...contentFields(draft), status: "DRAFT" },
    });
    revalidatePath("/dashboard/templates");
    return { ok: true, id: created.id, message: "Template saved. The local session can send it right away." };
  }

  // Editing: Meta must accept the change first, so what we send always matches what Meta approved.
  if (id) {
    const existing = await db.template.findUnique({ where: { id } });
    if (!existing) return { ok: false, message: "Template not found." };
    const merged = { ...draft, name: existing.name, language: existing.language, category: existing.category };
    try {
      if (live && existing.metaId) await editMetaTemplate(cfg, existing.metaId, await metaComponents(cfg, merged));
      else if (live) {
        const res = await createMetaTemplate(cfg, { name: existing.name, language: existing.language, category: existing.category, components: await metaComponents(cfg, merged) });
        await db.template.update({ where: { id }, data: { metaId: res.id } });
      }
    } catch (e) {
      return { ok: false, message: `Meta did not accept the change: ${errText(e)}` };
    }
    await db.template.update({
      where: { id },
      data: { ...contentFields(merged), status: live ? "PENDING" : "APPROVED", statusReason: null },
    });
    revalidatePath("/dashboard/templates");
    return {
      ok: true,
      id,
      message: live
        ? "Saved and sent to Meta for review. Batches pause until it's approved again, usually within minutes."
        : "Saved. Demo mode approves templates instantly.",
    };
  }

  if (await db.template.findUnique({ where: sameName })) {
    return { ok: false, errors: ["A template with this name and language already exists."] };
  }
  const created = await db.template.create({
    data: { clientId, name: draft.name, language: draft.language, category: draft.category, ...contentFields(draft), status: live ? "DRAFT" : "APPROVED" },
  });
  if (!live) {
    revalidatePath("/dashboard/templates");
    return { ok: true, id: created.id, message: "Template created. Demo mode approves templates instantly." };
  }
  try {
    const res = await createMetaTemplate(cfg, { name: draft.name, language: draft.language, category: draft.category, components: await metaComponents(cfg, draft) });
    await db.template.update({
      where: { id: created.id },
      data: { metaId: res.id, status: mapMetaStatus(res.status), category: res.category as never, lastSyncedAt: new Date() },
    });
  } catch (e) {
    await db.template.update({ where: { id: created.id }, data: { statusReason: errText(e) } });
    revalidatePath("/dashboard/templates");
    return { ok: false, id: created.id, message: `Saved as a draft, but Meta rejected it: ${errText(e)}` };
  }
  revalidatePath("/dashboard/templates");
  return { ok: true, id: created.id, message: "Submitted to Meta for approval." };
}

export async function syncTemplates(): Promise<ActionResult> {
  const s = await requireAdmin(true);
  if ("denied" in s) return { ok: false, message: s.denied };
  const { clientId } = s;
  const cfg = await clientWa(clientId);
  if (!cfg.live) return { ok: false, message: "Add this client's WhatsApp details on the Clients page to sync templates from Meta." };
  try {
    const remote = await listMetaTemplates(cfg);
    let imported = 0;
    for (const r of remote) {
      const parsed = fromMetaComponents(r.components ?? []);
      const status = mapMetaStatus(r.status);
      const category = (["MARKETING", "UTILITY", "AUTHENTICATION"].includes(r.category) ? r.category : "UTILITY") as never;
      const local = await db.template.findFirst({ where: { clientId, OR: [{ metaId: r.id }, { name: r.name, language: r.language }] } });
      const content = {
        ...parsed,
        headerText: parsed.headerType === "TEXT" ? parsed.headerText : null,
        footer: parsed.footer || null,
        category,
        status,
        statusReason: r.rejected_reason && r.rejected_reason !== "NONE" ? r.rejected_reason : null,
        metaId: r.id,
        lastSyncedAt: new Date(),
      };
      if (local) {
        await db.template.update({ where: { id: local.id }, data: content });
      } else {
        await db.template.create({ data: { clientId, name: r.name, language: r.language, ...content, variables: { "1": { source: "name" } } } });
        imported++;
      }
    }
    revalidatePath("/dashboard/templates");
    return { ok: true, message: `Synced ${remote.length} templates from Meta${imported ? `, ${imported} new` : ""}.` };
  } catch (e) {
    return { ok: false, message: errText(e) };
  }
}

export async function deleteTemplate(id: string): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const t = await db.template.findUnique({ where: { id }, include: { _count: { select: { campaigns: true } } } });
  if (!t) return { ok: false, message: "Template not found." };
  if (t._count.campaigns) return { ok: false, message: "This template is used by a campaign. Change or delete the campaign first." };
  try {
    const cfg = await clientWa(t.clientId);
    if (cfg.live && t.metaId) await deleteMetaTemplate(cfg, t.name, t.metaId);
  } catch (e) {
    return { ok: false, message: errText(e) };
  }
  await db.template.delete({ where: { id } });
  revalidatePath("/dashboard/templates");
  return { ok: true, message: "Template deleted." };
}

export async function sendTestMessage(id: string, rawPhone: string): Promise<ActionResult> {
  const s = await requireAdmin();
  if ("denied" in s) return { ok: false, message: s.denied };
  const phone = normalizePhone(rawPhone);
  if (!phone) return { ok: false, message: "Enter a valid mobile number." };
  const t = await db.template.findUnique({ where: { id }, include: { client: true } });
  if (!t) return { ok: false, message: "Template not found." };
  if (t.category === "AUTHENTICATION") return { ok: false, message: "Authentication templates are sent by your app's login flow, not from here." };
  const settings = await getSettings();
  if (!templateSendable(settings, t)) return { ok: false, message: "Only templates approved by Meta can be sent." };
  const ready = await readiness(settings, t.client);
  if (!ready.ok) return { ok: false, message: ready.reason };

  const customer =
    (await db.customer.findUnique({ where: { clientId_phone: { clientId: t.clientId, phone } } })) ??
    (await db.customer.create({ data: { clientId: t.clientId, phone, name: "Test recipient", tags: ["test"] } }));
  try {
    const res = await deliver(settings, t, customer, t.client);
    await db.message.create({
      data: {
        customerId: customer.id, templateId: t.id, templateName: t.name, body: res.text, status: "SENT",
        waMessageId: res.id, simulated: res.simulated, provider: res.provider, sentAt: new Date(),
      },
    });
    revalidatePath("/dashboard/messages");
    return { ok: true, message: res.simulated ? "Simulated send logged (demo mode)." : `Test sent to +${phone}.` };
  } catch (e) {
    await db.message.create({
      data: { customerId: customer.id, templateId: t.id, templateName: t.name, status: "FAILED", provider: settings.provider, error: errText(e), failedAt: new Date() },
    });
    return { ok: false, message: errText(e) };
  }
}
