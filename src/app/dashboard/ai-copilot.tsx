"use client";

import { ArrowUpRight, Sparkles } from "@/components/icons";
import Link from "@/components/intent-link";
import { useState, useTransition } from "react";
import { askAiBusinessCopilotAction } from "./actions/ai";

const QUICK_QUESTIONS = [
  "What should I do first?",
  "What is selling best?",
  "Who should I win back?",
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
      list.push({ label: `Reply to ${unhandledCount} waiting (${openWindowCount} free 24h)`, href: "/dashboard/replies" });
    }
    list.push({ label: "Manage Orders", href: "/dashboard/orders" });
    list.push({ label: "WhatsApp Costs", href: "/dashboard/revenue" });
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
              : "Smart Telemetry · Free",
        );
      }
    });
  };

  return (
    <section className="rounded-[18px] border-[1.5px] border-[#EADFCB] bg-white p-5 shadow-[0_1px_0_rgba(16,40,59,.04),0_14px_30px_-22px_rgba(16,40,59,.35)] dark:border-[#27465C] dark:bg-[#133248] space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display font-semibold text-[19px] text-[#10283B] dark:text-[#FFF9F0]">
            Your daily brief
          </h2>
          <p className="text-[13.5px] text-[#5A6B7B] dark:text-[#A8BACA] mt-0.5">
            Plain-language advice for today. Free.
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-bold bg-[#20C985]/15 text-[#0E8A5B] dark:text-[#5BE3AE]">
            <span className="size-1.5 rounded-full bg-[#20C985] animate-pulse" />
            {freeServiceRemaining.toLocaleString("en-IN")}/{freeServiceLimit.toLocaleString("en-IN")} free service left
          </span>
          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium bg-[#FFF3D6] text-[#8A5A00] dark:bg-white/10 dark:text-white/80">
            {providerLabel}
          </span>
        </div>
      </div>

      <div className="text-[14.5px] leading-relaxed text-[#10283B] dark:text-[#FFF9F0]">
        <p>{answer}</p>
        {actions.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {actions.map((a) => (
              <Link
                key={a.href + a.label}
                href={a.href}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-lg border-[1.5px] border-[#EADFCB] dark:border-[#27465C] bg-[#FFF9F0] dark:bg-white/5 text-[12.5px] font-semibold text-[#10283B] dark:text-[#FFF9F0] hover:border-[#10283B] transition"
              >
                {a.label} <ArrowUpRight aria-hidden className="size-3" />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Interactive Suggestion Chips */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {QUICK_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            disabled={pending}
            onClick={() => {
              setQuestion(q);
              ask(q);
            }}
            className="border-[1.5px] border-[#EADFCB] bg-white rounded-full px-3.5 py-1.5 text-[13px] font-semibold text-[#5A6B7B] hover:border-[#10283B] hover:text-[#10283B] transition dark:border-[#27465C] dark:bg-[#133248] dark:text-[#A8BACA] dark:hover:text-[#FFF9F0] dark:hover:border-[#FFF9F0] disabled:opacity-50 text-left"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Input */}
      <form
        className="flex flex-col sm:flex-row gap-2 pt-1"
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <input
          className="min-h-[42px] rounded-xl border-[1.5px] border-[#EADFCB] bg-white px-3.5 text-[14px] text-[#10283B] placeholder:text-[#5A6B7B]/70 focus:outline-none focus:border-[#10283B] dark:border-[#27465C] dark:bg-[#0B1E2D] dark:text-[#FFF9F0] dark:placeholder:text-[#A8BACA]/70 flex-1"
          placeholder="Ask AI Copilot anything about your WhatsApp spend, orders, or customers…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button
          type="submit"
          disabled={!question.trim() || pending}
          className="inline-flex min-h-[42px] items-center justify-center gap-2 px-4 rounded-xl bg-[#FFC329] font-semibold text-[14px] text-[#10283B] hover:brightness-105 disabled:opacity-50 transition"
        >
          <Sparkles aria-hidden className="size-4" /> Ask
        </button>
      </form>
    </section>
  );
}
