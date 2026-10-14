"use server";

import {
  askBusinessCopilot,
  generateCustomerFollowUp,
  generateOrOptimizeTemplate,
  generateSmartRepliesForInbox,
  parseNaturalLanguageAudience,
  parseOrderFromWhatsAppText,
  type AudienceAiFilter,
  type GeneratedTemplateResult,
  type ParsedOrderFromChat,
  type ReplyAnalysisResult,
} from "@/lib/ai";
import { db } from "@/lib/db";
import { getScope, owned } from "@/lib/session";
import { spendSummary } from "@/lib/spend";

const WINDOW_MS = 24 * 3_600_000;

/**
 * 1. Generate AI Smart Replies (English, Tanglish, Tamil) + Intent classification for a customer inbox thread.
 */
export async function getAiSmartRepliesAction(customerId: string): Promise<{
  ok: boolean;
  message?: string;
  data?: ReplyAnalysisResult;
}> {
  const scope = await getScope();
  const customer = await db.customer.findFirst({
    where: { id: customerId, ...owned(scope) },
    include: {
      client: { select: { name: true } },
      replies: { orderBy: { receivedAt: "desc" }, take: 3 },
    },
  });
  if (!customer) return { ok: false, message: "Customer not found." };

  const lastMessage =
    customer.replies
      .map((r) => r.text)
      .filter(Boolean)
      .join(" | ") || "Hi, please share details";

  const data = await generateSmartRepliesForInbox({
    customerName: customer.name,
    lastCustomerMessage: lastMessage,
    recentPurchases: customer.purchases,
    businessName: customer.client.name,
  });

  return { ok: true, data };
}

/**
 * 2. Generate or Optimize a Meta WhatsApp Template (or convert Marketing -> 7.5x cheaper Utility / Tamil).
 */
export async function generateAiTemplateAction(params: {
  prompt: string;
  category: "MARKETING" | "UTILITY";
  language: string;
  businessName: string;
  currentBody?: string;
  mode: "generate" | "optimize_utility" | "translate_tamil";
}): Promise<{ ok: boolean; message?: string; data?: GeneratedTemplateResult }> {
  const scope = await getScope();
  if (!scope.canOperate) return { ok: false, message: "Your login is view-only." };

  const data = await generateOrOptimizeTemplate(params);
  return { ok: true, data };
}

/**
 * 3. Parse an unstructured WhatsApp chat message into structured Indian order & shipping address fields.
 */
export async function parseOrderFromChatAction(rawText: string): Promise<{
  ok: boolean;
  message?: string;
  data?: ParsedOrderFromChat;
}> {
  const scope = await getScope();
  if (!scope.canOperate) return { ok: false, message: "Your login is view-only." };
  if (!rawText.trim()) return { ok: false, message: "Paste the customer's WhatsApp message or address first." };

  const data = await parseOrderFromWhatsAppText(rawText);
  return { ok: true, data };
}

/**
 * 4. Zoho Zia-style Executive AI Business Copilot on the main dashboard.
 */
export async function askAiBusinessCopilotAction(question: string): Promise<{
  ok: boolean;
  message?: string;
  data?: {
    answer: string;
    actionItems: { label: string; href: string }[];
    provider: string;
  };
}> {
  const scope = await getScope();
  const cWhere = owned(scope);
  const relWhere = scope.clientId ? { customer: { clientId: scope.clientId } } : {};
  const openCutoff = new Date(Date.now() - WINDOW_MS);

  const [
    clientRow,
    totalCustomers,
    unhandledReplies,
    openWindowSenders,
    pendingDispatchCount,
    approvedTemplates,
    spend,
  ] = await Promise.all([
    scope.clientId ? db.client.findUnique({ where: { id: scope.clientId }, select: { name: true } }) : Promise.resolve(null),
    db.customer.count({ where: { ...cWhere, optedOut: false, unreachable: false } }),
    db.reply.count({ where: { ...relWhere, handled: false } }),
    db.reply.findMany({
      where: { ...relWhere, receivedAt: { gte: openCutoff } },
      distinct: ["customerId"],
      select: { customerId: true },
    }),
    db.order.count({
      where: {
        ...(scope.clientId ? { clientId: scope.clientId } : {}),
        status: { in: ["CONFIRMED", "PAID"] },
      },
    }),
    db.template.count({
      where: {
        ...(scope.clientId ? { clientId: scope.clientId } : {}),
        status: "APPROVED",
      },
    }),
    spendSummary(scope.clientId ?? "__all__"),
  ]);

  const data = await askBusinessCopilot({
    question: question.trim() || "What should I focus on today to maximize orders and minimize Meta WhatsApp cost?",
    metrics: {
      businessName: clientRow?.name || "Thabaal WhatsApp Hub",
      totalCustomers,
      unhandledReplies,
      openWindowCount: openWindowSenders.length,
      monthSpentInr: spend.totalMonthSpent,
      freeServiceRemaining: spend.serviceQuota.freeRemaining,
      freeServiceLimit: spend.serviceQuota.totalFreeLimit,
      walletBalanceInr: spend.remainingBalance,
      monthOrdersCount: spend.monthOrdersCount,
      monthOrderRevenue: spend.monthOrderRevenue,
      pendingDispatchCount,
      approvedTemplates,
    },
  });

  return { ok: true, data };
}

/**
 * 5. Generate a personalized 1-to-1 customer follow-up or win-back draft on the Customer detail page.
 */
export async function generateCustomerFollowUpAction(
  customerId: string,
  goal: "winback" | "payment_followup" | "vip_new_arrival",
): Promise<{ ok: boolean; message?: string; text?: string; provider?: string }> {
  const scope = await getScope();
  const customer = await db.customer.findFirst({
    where: { id: customerId, ...owned(scope) },
    include: {
      client: { select: { name: true } },
      replies: { orderBy: { receivedAt: "desc" }, take: 1 },
    },
  });
  if (!customer) return { ok: false, message: "Customer not found." };

  const res = await generateCustomerFollowUp({
    customerName: customer.name,
    location: customer.location,
    purchases: customer.purchases,
    notes: customer.tags.join(", ") || null,
    lastReplyText: customer.replies[0]?.text ?? null,
    businessName: customer.client.name,
    goal,
  });

  return { ok: true, text: res.text, provider: res.provider };
}

/**
 * 6. Natural-Language Audience Filter Builder ("Customers in Chennai who bought silk sarees and replied").
 */
export async function generateAudienceFilterAction(prompt: string): Promise<{
  ok: boolean;
  message?: string;
  data?: AudienceAiFilter;
}> {
  const scope = await getScope();
  if (!scope.canManage) return { ok: false, message: "Only managers can build audiences." };
  if (!prompt.trim()) return { ok: false, message: "Describe the audience you want to filter first." };
  const data = await parseNaturalLanguageAudience(prompt.slice(0, 500));
  return { ok: true, data };
}
