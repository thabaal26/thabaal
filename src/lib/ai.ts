import { GoogleGenAI } from "@google/genai";

export type AIProviderUsed = "gemini-3.8-flash" | "groq-llama-3.3" | "smart-engine";

export type SmartReplySuggestion = {
  lang: "English" | "Tamil" | "Tanglish";
  label: string;
  text: string;
};

export type ReplyAnalysisResult = {
  provider: AIProviderUsed;
  intent: "ORDER_INQUIRY" | "PAYMENT_PROOF" | "DELIVERY_STATUS" | "PRICE_CATALOG" | "COMPLAINT" | "GENERAL";
  intentLabel: string;
  urgency: "HIGH" | "MEDIUM" | "LOW";
  summary: string;
  suggestions: SmartReplySuggestion[];
};

export type GeneratedTemplateResult = {
  provider: AIProviderUsed;
  name: string;
  category: "MARKETING" | "UTILITY";
  headerType: "NONE" | "TEXT";
  headerText: string;
  body: string;
  footer: string;
  buttons: { type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER"; text: string; url?: string; phoneNumber?: string }[];
  variables: Record<string, { source: "name" | "first_name" | "phone" | "location" | "purchases" | "static"; value?: string }>;
  costTip: string;
  approvalScore: number;
};

export type ParsedOrderFromChat = {
  provider: AIProviderUsed;
  recipientName: string;
  recipientPhone: string;
  itemsSummary: string;
  amountRupees: number | null;
  addressLine1: string;
  addressLine2: string;
  landmark: string;
  city: string;
  state: string;
  pincode: string;
  notes: string;
};

export type AudienceAiFilter = {
  provider: AIProviderUsed;
  explanation: string;
  suggestedName: string;
  search?: string;
  location?: string;
  tag?: string;
  optOut?: "in" | "out" | "all";
  replied?: "yes" | "no" | "all";
  purchased?: "yes" | "no" | "all";
};

/**
 * Core Free AI text/JSON generator:
 * 1. Google Gemini Free Tier (`gemini-3.8-flash` via `@google/genai` Interactions API)
 * 2. Groq Free Cloud API (`llama-3.3-70b-versatile`)
 * 3. Instant local domain engine fallback (`₹0/month` guaranteed uptime)
 */
async function callFreeLLM(prompt: string, systemInstruction?: string): Promise<{ text: string; provider: AIProviderUsed } | null> {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (geminiKey) {
    try {
      const client = new GoogleGenAI({ apiKey: geminiKey });
      const fullInput = systemInstruction ? `${systemInstruction}\n\n${prompt}` : prompt;
      const interaction = await client.interactions.create({
        model: "gemini-3.8-flash",
        input: fullInput,
      });
      const out = (interaction as { output_text?: string }).output_text?.trim();
      if (out) {
        return { text: out, provider: "gemini-3.8-flash" };
      }
    } catch (err) {
      console.warn("[AI] Gemini 3.8 Flash call failed, falling back:", err instanceof Error ? err.message : String(err));
    }
  }

  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${groqKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          temperature: 0.35,
          max_tokens: 900,
          messages: [
            ...(systemInstruction ? [{ role: "system", content: systemInstruction }] : []),
            { role: "user", content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(12_000),
      });
      if (res.ok) {
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const out = data.choices?.[0]?.message?.content?.trim();
        if (out) return { text: out, provider: "groq-llama-3.3" };
      }
    } catch (err) {
      console.warn("[AI] Groq call failed, falling back:", err instanceof Error ? err.message : String(err));
    }
  }

  return null;
}

function extractJson<T>(raw: string): T | null {
  try {
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1].trim() : raw.trim();
    const startObj = candidate.indexOf("{");
    const endObj = candidate.lastIndexOf("}");
    if (startObj !== -1 && endObj > startObj) {
      return JSON.parse(candidate.slice(startObj, endObj + 1)) as T;
    }
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}

/**
 * 1. Smart Reply & Intent Analyzer for Customer Inbox (English + Tamil + Tanglish)
 */
export async function generateSmartRepliesForInbox(params: {
  customerName: string;
  lastCustomerMessage: string;
  recentPurchases?: string | null;
  businessName?: string;
}): Promise<ReplyAnalysisResult> {
  const { customerName, lastCustomerMessage, recentPurchases, businessName = "our store" } = params;
  const firstName = customerName.split(/\s+/)[0] || "there";

  const llm = await callFreeLLM(
    `Analyze this incoming WhatsApp customer message and generate 3 short, natural WhatsApp replies (1 in English, 1 in Tamil script, 1 in conversational Tanglish).
Customer Name: ${customerName}
Past Purchases: ${recentPurchases || "None recorded"}
Business Name: ${businessName}
Incoming WhatsApp Message: "${lastCustomerMessage}"

Return strict JSON matching:
{
  "intent": "ORDER_INQUIRY" | "PAYMENT_PROOF" | "DELIVERY_STATUS" | "PRICE_CATALOG" | "COMPLAINT" | "GENERAL",
  "intentLabel": "2-3 word badge label",
  "urgency": "HIGH" | "MEDIUM" | "LOW",
  "summary": "1 short sentence summary of what the customer wants",
  "suggestions": [
    { "lang": "English", "label": "English reply", "text": "..." },
    { "lang": "Tanglish", "label": "Tanglish reply", "text": "..." },
    { "lang": "Tamil", "label": "தமிழ் பதில்", "text": "..." }
  ]
}`,
    "You are an expert Indian WhatsApp Commerce assistant for a boutique/retail brand. Always return valid JSON only.",
  );

  if (llm) {
    const parsed = extractJson<Omit<ReplyAnalysisResult, "provider">>(llm.text);
    if (parsed && Array.isArray(parsed.suggestions) && parsed.suggestions.length > 0) {
      return { ...parsed, provider: llm.provider };
    }
  }

  // Deterministic domain-aware analysis fallback
  const lower = lastCustomerMessage.toLowerCase();
  if (/paid|gpay|phonepe|upi|payment|screenshot|sent money|transfer/i.test(lower)) {
    return {
      provider: "smart-engine",
      intent: "PAYMENT_PROOF",
      intentLabel: "Payment confirmation",
      urgency: "HIGH",
      summary: `${firstName} shared a payment update and is waiting for order confirmation.`,
      suggestions: [
        {
          lang: "English",
          label: "Confirm payment & dispatch",
          text: `Hi ${firstName}! Thank you, we have received your payment ✅ We are packing your order now and will share the tracking slip shortly.`,
        },
        {
          lang: "Tanglish",
          label: "Tanglish payment ack",
          text: `Hi ${firstName} mam/sir! Payment receive aagiduchu ✅ Order pack pannitu tracking details seekiram share panrom. Thank you!`,
        },
        {
          lang: "Tamil",
          label: "தமிழ் கட்டண உறுதிப்படுத்தல்",
          text: `வணக்கம் ${firstName}! உங்கள் கட்டணம் பெறப்பட்டது ✅ ஆர்டரை பேக் செய்து விரைவில் டிராக்கிங் விவரங்களை அனுப்புகிறோம்.`,
        },
      ],
    };
  }

  if (/track|courier|where|dispatch|delivery|shipped|status|when will/i.test(lower)) {
    return {
      provider: "smart-engine",
      intent: "DELIVERY_STATUS",
      intentLabel: "Tracking / Delivery",
      urgency: "HIGH",
      summary: `${firstName} is asking for courier dispatch or delivery tracking details.`,
      suggestions: [
        {
          lang: "English",
          label: "Share dispatch status",
          text: `Hi ${firstName}, your order has been dispatched via courier 🚚 I'm sharing your tracking number right away—it should reach you within 2–3 working days.`,
        },
        {
          lang: "Tanglish",
          label: "Tanglish courier update",
          text: `Hi ${firstName}! Unga parcel courier-la dispatch aagiduchu 🚚 Tracking slip ippo anupuren, 2-3 days-la reach aagidum!`,
        },
        {
          lang: "Tamil",
          label: "தமிழ் கூரியர் தகவல்",
          text: `வணக்கம் ${firstName}, உங்கள் பார்சல் கூரியரில் அனுப்பப்பட்டுள்ளது 🚚 டிராக்கிங் எண்ணை இதோ பகிர்கிறோம், 2-3 நாட்களில் வந்து சேரும்.`,
        },
      ],
    };
  }

  if (/price|rate|cost|how much|available|stock|collection|catalogue|catalog|photo|saree|dress|item|order|book/i.test(lower)) {
    return {
      provider: "smart-engine",
      intent: "PRICE_CATALOG",
      intentLabel: "Price & Availability",
      urgency: "HIGH",
      summary: `${firstName} is inquiring about product price, stock availability, or booking.`,
      suggestions: [
        {
          lang: "English",
          label: "Confirm stock & share price",
          text: `Hi ${firstName}! Yes, this piece is available in ready stock ✨ Shall I share the full price details and reserve one for you?`,
        },
        {
          lang: "Tanglish",
          label: "Tanglish stock + booking",
          text: `Hi ${firstName}! Yes available-aa iruku ✨ Ready stock dhaan. Price details & booking link anupava? Address share panna udane book pannidalam!`,
        },
        {
          lang: "Tamil",
          label: "தமிழ் விலை & இருப்பு",
          text: `வணக்கம் ${firstName}! ஆம், இது கையிருப்பில் உள்ளது ✨ முழு விலை விவரங்களை பகிரட்டுமா? உங்கள் முகவரியை அனுப்பி உடனே புக் செய்யலாம்.`,
        },
      ],
    };
  }

  return {
    provider: "smart-engine",
    intent: "GENERAL",
    intentLabel: "Customer reply",
    urgency: "MEDIUM",
    summary: `${firstName} sent a message inside the 24-hour free service window.`,
    suggestions: [
      {
        lang: "English",
        label: "Warm helpful reply",
        text: `Hi ${firstName}! Thank you for messaging ${businessName} 😊 How can I help you with your order or collection today?`,
      },
      {
        lang: "Tanglish",
        label: "Tanglish friendly reply",
        text: `Hi ${firstName}! Welcome to ${businessName} 😊 Unga order allathu pudhu collection pathi enna details venum-nu sollunga, ippo share panren!`,
      },
      {
        lang: "Tamil",
        label: "தமிழ் வரவேற்பு பதில்",
        text: `வணக்கம் ${firstName}! ${businessName}-க்கு வரவேற்கிறோம் 😊 இன்று உங்களுக்கு என்ன தகவல் அல்லது ஆர்டர் உதவி தேவை என்று கூறுங்கள்.`,
      },
    ],
  };
}

/**
 * 2. AI Meta Template Writer & Cost/Approval Optimizer
 * Also supports converting a Marketing draft into a 7.5x cheaper Utility template (₹0.115 vs ₹0.8631).
 */
export async function generateOrOptimizeTemplate(params: {
  prompt: string;
  category: "MARKETING" | "UTILITY";
  language: string;
  businessName: string;
  currentBody?: string;
  mode: "generate" | "optimize_utility" | "translate_tamil";
}): Promise<GeneratedTemplateResult> {
  const { prompt, category, language, businessName, currentBody, mode } = params;

  const taskPrompt =
    mode === "optimize_utility"
      ? `Rewrite this WhatsApp template so Meta strictly approves it as a UTILITY template (₹0.115/msg instead of ₹0.8631/msg Marketing). Remove promotional hype, discounts, or sales urgency, and frame it as an account/order/booking/request update.
Current body: "${currentBody || prompt}"`
      : mode === "translate_tamil"
        ? `Translate and adapt this WhatsApp template into natural, polite Tamil (with English numbers/placeholders {{1}}, {{2}} intact):
Current body: "${currentBody || prompt}"`
        : `Create a high-converting, Meta-compliant WhatsApp ${category} template for "${businessName}" (Language: ${language}).
Goal / Prompt: "${prompt}"`;

  const llm = await callFreeLLM(
    `${taskPrompt}

Rules for Meta WhatsApp Template Approval:
- Use sequential placeholders {{1}}, {{2}} (never start or end the body with a placeholder, and never place two placeholders side-by-side).
- Header text max 60 chars, no emojis in UTILITY headers.
- Footer max 60 chars.
- Button text max 25 chars.
Return strict JSON:
{
  "name": "snake_case_template_name",
  "category": "MARKETING" | "UTILITY",
  "headerType": "NONE" | "TEXT",
  "headerText": "...",
  "body": "...",
  "footer": "...",
  "buttons": [{ "type": "QUICK_REPLY", "text": "..." }],
  "variables": { "1": { "source": "first_name" }, "2": { "source": "static", "value": "..." } },
  "costTip": "Short explanation of why this passes Meta review and saves cost",
  "approvalScore": 98
}`,
    "You are a Meta WhatsApp Business API compliance & conversion expert for India. Return valid JSON only.",
  );

  if (llm) {
    const parsed = extractJson<Omit<GeneratedTemplateResult, "provider">>(llm.text);
    if (parsed && parsed.body) {
      return {
        ...parsed,
        name: (parsed.name || "ai_template").toLowerCase().replace(/[^a-z0-9_]/g, "_"),
        provider: llm.provider,
      };
    }
  }

  // Deterministic fallback templates for generate / optimize_utility / translate_tamil
  if (mode === "optimize_utility" || category === "UTILITY") {
    return {
      provider: "smart-engine",
      name: "order_dispatch_update",
      category: "UTILITY",
      headerType: "TEXT",
      headerText: "Order Status Update",
      body: "Hello {{1}}, your order reference {{2}} with " + businessName + " has been confirmed and is being prepared for dispatch. Reply here if you need any changes to your delivery address.",
      footer: businessName,
      buttons: [
        { type: "QUICK_REPLY", text: "Track Order" },
        { type: "QUICK_REPLY", text: "Confirm Address" },
      ],
      variables: {
        "1": { source: "first_name" },
        "2": { source: "static", value: "#ORD-1024" },
      },
      costTip: "Utility classification verified: zero promotional adjectives, transactional context, and non-adjacent {{1}}/{{2}} variables. Costs ₹0.115/msg (7.5× cheaper than ₹0.8631 Marketing!).",
      approvalScore: 99,
    };
  }

  if (mode === "translate_tamil" || language.startsWith("ta")) {
    return {
      provider: "smart-engine",
      name: "tamil_festive_collection",
      category: category,
      headerType: "TEXT",
      headerText: "புதிய கலெக்ஷன் வரவு ✨",
      body: "வணக்கம் {{1}}, நமது " + businessName + "-ல் புதிய சிறப்பு {{2}} கலெக்ஷன் இப்போது விற்பனைக்கு வந்துள்ளது. உடனேப் பார்வையிட கீழே உள்ள பட்டனை அழுத்தவும்.",
      footer: "நிறுத்த STOP என அனுப்பவும்",
      buttons: [
        { type: "QUICK_REPLY", text: "கலெக்ஷன் பார்க்க" },
        { type: "QUICK_REPLY", text: "விலை விவரம்" },
      ],
      variables: {
        "1": { source: "first_name" },
        "2": { source: "static", value: "பட்டு புடவை" },
      },
      costTip: "Natural Tamil script with spaced placeholders {{1}} and {{2}} and an opt-out footer for 98% Meta approval probability.",
      approvalScore: 98,
    };
  }

  const slug = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 28) || "special_offer_update";

  return {
    provider: "smart-engine",
    name: slug,
    category: "MARKETING",
    headerType: "TEXT",
    headerText: `New arrival at ${businessName} ✨`.slice(0, 58),
    body: `Hi {{1}}, we just launched our latest *{{2}}* collection at ${businessName}! Reply inside 24 hours to view full photos and reserve your favourite piece before stock runs out.`,
    footer: "Reply STOP to unsubscribe",
    buttons: [
      { type: "QUICK_REPLY", text: "Send Photos" },
      { type: "QUICK_REPLY", text: "Book Now" },
    ],
    variables: {
      "1": { source: "first_name" },
      "2": { source: "static", value: prompt.trim().slice(0, 36) || "Festive Special" },
    },
    costTip: "Includes a 'Send Photos' Quick Reply button: when the customer taps it, their reply opens a 24-hour FREE service window (first 1,000/mo free per number) so you can send unlimited catalogue photos at ₹0!",
    approvalScore: 97,
  };
}

/**
 * 3. AI WhatsApp Text-to-Order & Indian Shipping Address Parser
 */
export async function parseOrderFromWhatsAppText(rawChatText: string): Promise<ParsedOrderFromChat> {
  const llm = await callFreeLLM(
    `Extract structured Indian shipping & order details from this unstructured WhatsApp message pasted by a customer:
"""
${rawChatText}
"""

Return strict JSON:
{
  "recipientName": "",
  "recipientPhone": "digits only (10 or 12 digits)",
  "itemsSummary": "items with quantities",
  "amountRupees": number or null,
  "addressLine1": "door/flat no, street, nagar",
  "addressLine2": "area / locality",
  "landmark": "near/opposite landmark if any",
  "city": "city/town",
  "state": "Indian state name (default Tamil Nadu if TN city)",
  "pincode": "6 digit pincode if present",
  "notes": "any courier preference or special instructions"
}`,
    "You are an expert Indian courier & e-commerce address parser. Return valid JSON only.",
  );

  if (llm) {
    const parsed = extractJson<Omit<ParsedOrderFromChat, "provider">>(llm.text);
    if (parsed) {
      return { ...parsed, provider: llm.provider };
    }
  }

  // Smart regex + Indian address heuristic parser fallback
  const text = rawChatText.trim();
  const pincodeMatch = text.match(/\b([654321]\d{5})\b/);
  const pincode = pincodeMatch ? pincodeMatch[1] : "";

  const phoneMatch = text.match(/(?:\+?91[\s-]?)?([6-9]\d{4}[\s-]?\d{5})\b/);
  const recipientPhone = phoneMatch ? phoneMatch[1].replace(/\D/g, "") : "";

  const amountMatch = text.match(/(?:rs\.?|₹|inr|amount|total|paid)\s*[:=-]?\s*([0-9,]{2,7})/i);
  const amountRupees = amountMatch ? Number(amountMatch[1].replace(/,/g, "")) || null : null;

  const landmarkMatch = text.match(/(?:near|opp(?:osite)?|behind|next to|landmark\s*[:-]?)\s*([^\n,.]+)/i);
  const landmark = landmarkMatch ? landmarkMatch[1].trim() : "";

  const tnCities = [
    "Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Trichy", "Salem", "Tirunelveli",
    "Tiruppur", "Erode", "Vellore", "Thoothukudi", "Tuticorin", "Dindigul", "Thanjavur",
    "Ranipet", "Sivakasi", "Karur", "Udhagamandalam", "Ooty", "Hosur", "Nagercoil",
    "Kanchipuram", "Karaikudi", "Kumbakonam", "Cuddalore", "Pollachi", "Ambur", "Palani",
    "Pudukkottai", "Namakkal", "Villupuram", "Theni", "Nagapattinam", "Chengalpattu",
  ];
  let city = "";
  for (const c of tnCities) {
    if (new RegExp(`\\b${c}\\b`, "i").test(text)) {
      city = c === "Trichy" ? "Tiruchirappalli" : c;
      break;
    }
  }

  const lines = text
    .split(/[\n,;]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const nameLine = lines.find(
    (l) =>
      !/\d{5,}/.test(l) &&
      !/^(no\.|door|flat|plot|street|st\b|near|opp|pin|ph|mob|cell|item|order|rs|₹)/i.test(l) &&
      l.length >= 3 &&
      l.length <= 45,
  );
  const recipientName = nameLine ? nameLine.replace(/^(name|to)\s*[:=-]\s*/i, "").trim() : "";

  const itemLine = lines.find((l) => /\b(qty|pcs|piece|saree|kurti|set|combo|pack|kg|ml|size|blue|red|green|pink|silk|cotton)\b/i.test(l));
  const itemsSummary = itemLine || "";

  const addrLines = lines.filter(
    (l) =>
      l !== nameLine &&
      l !== itemLine &&
      !l.includes(recipientPhone) &&
      !/^(ph|mob|mobile|phone|pincode|pin)\s*[:=-]?\s*\d+$/i.test(l),
  );

  return {
    provider: "smart-engine",
    recipientName,
    recipientPhone,
    itemsSummary,
    amountRupees,
    addressLine1: addrLines[0] || "",
    addressLine2: addrLines.slice(1, 3).join(", "),
    landmark,
    city,
    state: pincode.startsWith("6") || city ? "Tamil Nadu" : "Tamil Nadu",
    pincode,
    notes: "",
  };
}

/**
 * 4. Zoho Zia-style Executive AI Business Copilot
 */
export async function askBusinessCopilot(params: {
  question: string;
  metrics: {
    businessName: string;
    totalCustomers: number;
    unhandledReplies: number;
    openWindowCount: number;
    monthSpentInr: number;
    freeServiceRemaining: number;
    freeServiceLimit: number;
    walletBalanceInr: number;
    monthOrdersCount: number;
    monthOrderRevenue: number;
    pendingDispatchCount: number;
    approvedTemplates: number;
  };
}): Promise<{ answer: string; actionItems: { label: string; href: string }[]; provider: AIProviderUsed }> {
  const { question, metrics } = params;

  const llm = await callFreeLLM(
    `You are the AI Business Copilot (like Zoho Zia) for "${metrics.businessName}".
Live Business Telemetry:
- Active Reachable Customers: ${metrics.totalCustomers}
- Unhandled Customer Replies Waiting: ${metrics.unhandledReplies}
- Open 24h Free Service Windows Right Now: ${metrics.openWindowCount}
- Free Service Messages Remaining This Month: ${metrics.freeServiceRemaining} / ${metrics.freeServiceLimit} (1,000 free/mo per number, then ₹0.115/msg)
- This Month Meta Spend: ₹${metrics.monthSpentInr.toFixed(2)} (Prepaid Wallet: ₹${metrics.walletBalanceInr.toFixed(2)})
- This Month Orders: ${metrics.monthOrdersCount} orders worth ₹${metrics.monthOrderRevenue.toLocaleString("en-IN")} (${metrics.pendingDispatchCount} awaiting courier dispatch)
- Approved Templates Ready: ${metrics.approvedTemplates}

User Question: "${question}"

Give a sharp, practical, data-backed answer in 2-4 concise sentences with concrete numbers from their telemetry and Meta India pricing rules (Marketing ₹0.8631, Utility ₹0.115, Service 1,000 free/mo then ₹0.115, 72h free CTWA window).`,
    "You are a sharp WhatsApp Commerce & Revenue Strategist for Indian businesses.",
  );

  const defaultActions: { label: string; href: string }[] = [];
  if (metrics.unhandledReplies > 0) {
    defaultActions.push({ label: `Reply to ${metrics.unhandledReplies} waiting (${metrics.openWindowCount} free 24h)`, href: "/dashboard/replies?filter=unhandled" });
  }
  if (metrics.pendingDispatchCount > 0) {
    defaultActions.push({ label: `Dispatch ${metrics.pendingDispatchCount} paid orders`, href: "/dashboard/orders" });
  }
  defaultActions.push({ label: "Launch Broadcast", href: "/dashboard/campaigns" });

  if (llm) {
    return {
      answer: llm.text,
      actionItems: defaultActions,
      provider: llm.provider,
    };
  }

  const q = question.toLowerCase();
  if (/cost|spend|save|free|1000|quota|bill|meta|price/i.test(q)) {
    return {
      provider: "smart-engine",
      answer: `You still have ${metrics.freeServiceRemaining.toLocaleString("en-IN")} of your ${metrics.freeServiceLimit.toLocaleString("en-IN")} FREE monthly service messages remaining (1,000 free/month per WhatsApp number; ₹0.115/msg after). You have ${metrics.openWindowCount} customers with an open 24-hour window right now—reply to them with catalogue photos at ₹0.00! For order & tracking alerts, always use Utility templates (₹0.115/msg) instead of Marketing (₹0.8631/msg) to cut template spend by 86%.`,
      actionItems: defaultActions,
    };
  }

  if (/order|revenue|sales|dispatch|courier|roas/i.test(q)) {
    const roas = metrics.monthSpentInr > 0 ? (metrics.monthOrderRevenue / (metrics.monthSpentInr * 1.18)).toFixed(1) : "∞";
    return {
      provider: "smart-engine",
      answer: `${metrics.businessName} has generated ${metrics.monthOrdersCount} orders worth ₹${metrics.monthOrderRevenue.toLocaleString("en-IN")} this month against ₹${metrics.monthSpentInr.toFixed(2)} in Meta spend (${roas}× ROAS). ${metrics.pendingDispatchCount > 0 ? `You have ${metrics.pendingDispatchCount} orders packed/paid waiting for courier tracking—dispatch them now to trigger a ₹0.115 Utility tracking notification.` : "All current orders are dispatched—great job!"}`,
      actionItems: defaultActions,
    };
  }

  return {
    provider: "smart-engine",
    answer: `Right now ${metrics.businessName} has ${metrics.unhandledReplies} unhandled customer ${metrics.unhandledReplies === 1 ? "reply" : "replies"} and ${metrics.openWindowCount} open 24-hour free service windows (${metrics.freeServiceRemaining.toLocaleString("en-IN")}/${metrics.freeServiceLimit.toLocaleString("en-IN")} free monthly service quota left). Reply to waiting customers first while the window is ₹0, then send a Quick-Reply broadcast to your ${metrics.totalCustomers.toLocaleString("en-IN")} opted-in customers to open fresh 24-hour conversion threads.`,
    actionItems: defaultActions,
  };
}

/**
 * 5. AI Personalized 1-to-1 Customer Follow-Up & Cart Win-Back Drafter
 */
export async function generateCustomerFollowUp(params: {
  customerName: string;
  location?: string | null;
  purchases?: string | null;
  notes?: string | null;
  lastReplyText?: string | null;
  businessName: string;
  goal: "winback" | "payment_followup" | "vip_new_arrival";
}): Promise<{ text: string; provider: AIProviderUsed }> {
  const { customerName, location, purchases, notes, lastReplyText, businessName, goal } = params;
  const firstName = customerName.split(/\s+/)[0] || "there";

  const llm = await callFreeLLM(
    `Write a warm, personalized 1-to-1 WhatsApp message (max 320 chars) for this customer from "${businessName}".
Customer: ${customerName}
City/Location: ${location || "Not specified"}
Past Purchases: ${purchases || "First-time buyer"}
Notes: ${notes || "None"}
Last Message They Sent: ${lastReplyText || "None"}
Goal: ${goal === "winback" ? "Re-engage past customer with matching new stock" : goal === "payment_followup" ? "Polite UPI/payment reminder to hold their reserved item" : "VIP early access to new arrivals"}

Return ONLY the WhatsApp message text (no quotes or preamble).`,
    "You are an expert personal shopper on WhatsApp for an Indian brand.",
  );

  if (llm && llm.text) {
    return { text: llm.text.replace(/^["']|["']$/g, ""), provider: llm.provider };
  }

  if (goal === "payment_followup") {
    return {
      provider: "smart-engine",
      text: `Hi ${firstName}! We've kept your selected ${purchases ? `*${purchases}*` : "piece"} reserved for you at ${businessName} ✨ Please share the UPI payment screenshot whenever convenient so we can dispatch it in today's courier batch${location ? ` to ${location}` : ""}!`,
    };
  }

  if (goal === "vip_new_arrival") {
    return {
      provider: "smart-engine",
      text: `Hi ${firstName}! Since you loved our ${purchases || "previous collection"}, wanted to give you first look at our new arrivals at ${businessName} before we post them publicly ✨ Shall I send you the photos here?`,
    };
  }

  return {
    provider: "smart-engine",
    text: `Hi ${firstName}! Hope you're doing well${location ? ` in ${location}` : ""} 😊 We just restocked fresh designs matching your style${purchases ? ` (like your ${purchases})` : ""} at ${businessName}. Reply 'YES' and I'll share the photos right away!`,
  };
}

/**
 * 6. AI Natural-Language Smart Audience Filter Builder
 */
export async function parseNaturalLanguageAudience(prompt: string): Promise<AudienceAiFilter> {
  const llm = await callFreeLLM(
    `Convert this natural language customer segment description into filter rules:
Prompt: "${prompt}"

Return strict JSON:
{
  "explanation": "1 sentence explaining the filter applied",
  "suggestedName": "Short segment name (e.g. Chennai Repeat Buyers)",
  "search": "keyword in name/purchases/notes or empty string",
  "location": "city/district name or empty string",
  "tag": "tag name or empty string",
  "optOut": "in" | "out" | "all",
  "replied": "yes" | "no" | "all",
  "purchased": "yes" | "no" | "all"
}`,
    "You map natural language customer queries into CRM filter JSON. Always return valid JSON only.",
  );

  if (llm) {
    const parsed = extractJson<Omit<AudienceAiFilter, "provider">>(llm.text);
    if (parsed && parsed.suggestedName) {
      return { ...parsed, provider: llm.provider };
    }
  }

  const lower = prompt.toLowerCase();
  const cities = ["chennai", "coimbatore", "madurai", "trichy", "salem", "erode", "tiruppur", "vellore", "tirunelveli", "bangalore", "hyderabad"];
  const foundCity = cities.find((c) => lower.includes(c));
  const location = foundCity ? foundCity.charAt(0).toUpperCase() + foundCity.slice(1) : "";

  const replied: "yes" | "no" | "all" =
    /never replied|haven't replied|no reply|unreplied/i.test(lower)
      ? "no"
      : /replied|engaged|active|chatted|messaged/i.test(lower)
        ? "yes"
        : "all";

  const purchased: "yes" | "no" | "all" =
    /never bought|no purchase|non-buyer|haven't bought|leads/i.test(lower)
      ? "no"
      : /bought|purchased|buyers|repeat|orders|vip/i.test(lower)
        ? "yes"
        : "all";

  let search = "";
  const itemMatch = lower.match(/\b(silk|cotton|saree|kurti|wholesale|bridal|combo|festive)\b/i);
  if (itemMatch) search = itemMatch[1];

  const nameParts = [
    location || "All",
    purchased === "yes" ? "Buyers" : purchased === "no" ? "Leads" : "Customers",
    replied === "yes" ? "(Replied)" : replied === "no" ? "(No Reply)" : "",
  ].filter(Boolean);

  return {
    provider: "smart-engine",
    explanation: `Filtered for opted-in customers${location ? ` in ${location}` : ""}${purchased !== "all" ? ` with purchase=${purchased}` : ""}${replied !== "all" ? ` and replied=${replied}` : ""}${search ? ` matching "${search}"` : ""}.`,
    suggestedName: nameParts.join(" "),
    search,
    location,
    tag: "",
    optOut: "in",
    replied,
    purchased,
  };
}
