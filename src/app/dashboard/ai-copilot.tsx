"use client";

import { ArrowUpRight, Sparkles } from "@/components/icons";
import Link from "@/components/intent-link";
import { useState, useTransition } from "react";
import { Badge, Button, buttonClass, Card, CardHeader } from "@/components/ui";
import { cn } from "@/lib/cn";
import { askAiBusinessCopilotAction } from "./actions/ai";

const QUICK_QUESTIONS = [
  "How do I save Meta cost & use my 1,000 free service messages?",
  "What is my WhatsApp order revenue & ROAS this month?",
  "Which customers should I reply to right now at ₹0?",
];

export function AiBusinessCopilot({
  initialBrief,
  freeServiceRemaining,
  freeServiceLimit,
  openWindowCount,
  unhandledCount,
}: {
  initialBrief: string;
  freeServiceRemaining: number;
  freeServiceLimit: number;
  openWindowCount: number;
  unhandledCount: number;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(initialBrief);
  const [actions, setActions] = useState<{ label: string; href: string }[]>(() => {
    const list: { label: string; href: string }[] = [];
    if (unhandledCount > 0) {
      list.push({ label: `Reply to ${unhandledCount} waiting (${openWindowCount} free 24h)`, href: "/dashboard/replies?filter=unhandled" });
    }
    list.push({ label: "Optimize Templates (₹0.115 Utility)", href: "/dashboard/templates" });
    list.push({ label: "Manage Orders", href: "/dashboard/orders" });
    return list;
  });
  const [providerLabel, setProviderLabel] = useState("Free AI Copilot");
  const [pending, start] = useTransition();

  const ask = (q: string) => {
    const query = q.trim();
    if (!query) return;
    start(async () => {
      const res = await askAiBusinessCopilotAction(query);
      if (res.ok && res.data) {
        setAnswer(res.data.answer);
        if (res.data.actionItems?.length) setActions(res.data.actionItems);
        setProviderLabel(
          res.data.provider === "gemini-3.8-flash"
            ? "Gemini 3.8 Flash · Free"
            : res.data.provider === "groq-llama-3.3"
              ? "Llama 3.3 70B · Free"
              : "Smart Telemetry Engine · Free",
        );
      }
    });
  };

  return (
    <Card className="card-3d border-brand/25">
      <CardHeader
        tone="brand"
        icon={
          <span className="grid size-8 place-items-center rounded-control bg-brand-soft text-brand-deep">
            <Sparkles aria-hidden className="size-4" />
          </span>
        }
        title="AI Business Copilot & Daily Brief"
        description="Zia-style live telemetry advisor · analyzes your 1,000 free monthly service messages, 24h windows, Meta spend & order ROAS"
        action={
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="green" dot>
              {freeServiceRemaining.toLocaleString("en-IN")}/{freeServiceLimit.toLocaleString("en-IN")} free service left
            </Badge>
            <Badge tone="gray">{providerLabel}</Badge>
          </div>
        }
      />

      <div className="space-y-3 p-3.5 sm:p-5">
        {/* AI Insight / Answer Box */}
        <div className="rounded-control border border-brand/25 bg-brand-soft/25 p-3 text-xs leading-relaxed text-ink sm:text-sm">
          <p>{answer}</p>
          {actions.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {actions.map((a) => (
                <Link key={a.href + a.label} href={a.href} className={cn(buttonClass("secondary", "sm"), "min-h-7 px-2.5 text-[11px]")}>
                  {a.label} <ArrowUpRight aria-hidden className="size-3" />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* 1-Tap Quick Questions */}
        <div className="flex flex-wrap items-center gap-1.5">
          {QUICK_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              disabled={pending}
              onClick={() => {
                setQuestion(q);
                ask(q);
              }}
              className="rounded-full border border-line bg-subtle/60 px-2.5 py-1 text-left text-[11px] font-medium text-ink-2 transition hover:border-brand hover:bg-brand-soft/40 hover:text-brand-deep disabled:opacity-50"
            >
              ✦ {q}
            </button>
          ))}
        </div>

        {/* Custom Question Input */}
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            ask(question);
          }}
        >
          <input
            className="field flex-1 text-xs sm:text-sm"
            placeholder="Ask AI Copilot anything about your WhatsApp spend, orders, templates or customers…"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <Button type="submit" size="md" loading={pending} disabled={!question.trim()}>
            <Sparkles aria-hidden className="size-4" /> Ask Copilot
          </Button>
        </form>
      </div>
    </Card>
  );
}
