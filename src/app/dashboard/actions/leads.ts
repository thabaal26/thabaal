"use server";

// Admin panel › Enquiries (lib/leads.ts). Admins only.

import { revalidatePath } from "next/cache";
import { addLead, convertLead, logCall, moveLead, setNextFollowUp, updateLead, type LeadInput, type LeadResult } from "@/lib/leads";
import { requireAdmin, requireUser } from "@/lib/session";

async function admin() {
  const scope = await requireAdmin();
  if ("denied" in scope) return null;
  const user = await requireUser();
  return { isAdmin: true, id: user.id, name: user.name || user.email };
}
const denied: LeadResult = { ok: false, message: "Only Thabaal can change enquiries." };
const done = (r: LeadResult, id?: string) => {
  if (r.ok) {
    revalidatePath("/admin/enquiries");
    if (id) revalidatePath(`/admin/enquiries/${id}`);
  }
  return r;
};

export async function addEnquiry(input: LeadInput): Promise<LeadResult> {
  const who = await admin();
  return who ? done(await addLead(who, input)) : denied;
}

export async function saveEnquiry(id: string, input: LeadInput): Promise<LeadResult> {
  const who = await admin();
  return who ? done(await updateLead(who, id, input), id) : denied;
}

export async function moveEnquiry(id: string, stage: string): Promise<LeadResult> {
  const who = await admin();
  return who ? done(await moveLead(who, id, stage), id) : denied;
}

export async function logEnquiryCall(id: string, input: { text: string; nextOn?: string }): Promise<LeadResult> {
  const who = await admin();
  return who ? done(await logCall(who, id, input), id) : denied;
}

export async function setEnquiryFollowUp(id: string, day: string): Promise<LeadResult> {
  const who = await admin();
  return who ? done(await setNextFollowUp(who, id, day), id) : denied;
}

export async function makeBusiness(id: string, input: { name: string; city: string; businessType?: string }): Promise<LeadResult> {
  const who = await admin();
  if (!who) return denied;
  const r = await convertLead(who, id, input);
  if (r.ok) revalidatePath("/admin", "layout");
  return done(r, id);
}
