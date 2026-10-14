"use client";

import { ArrowUpRight, Sparkles } from "@/components/icons";
import Link from "@/components/intent-link";
import { useState, useTransition } from "react";
import { askAiBusinessCopilotAction } from "./actions/ai";

const QUICK_QUESTIONS = ["What should I do first?", "What is selling best?", "Who should I win back?"];

/**
 * "Your daily brief": a plain-language summary built from today's live figures, with buttons to the
 * pages it mentions. Asking a question sends it to the assistant (actions/ai.ts), which answers from
 * the same live data.
 */
export function AiBusinessCopilot({
  initialBrief,
  initialActions,
}: {
  initialBrief: string;
  initialActions: { label: string; href: string }[];
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState(initialBrief);
  const [actions, setActions] = useState(initialActions);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const ask = (q: string) => {
    const query = q.trim();
    if (!query) return;
    setError(null);
    start(async () => {
      const res = await askAiBusinessCopilotAction(query);
      if (res.ok && res.data) {
        setAnswer(res.data.answer);
        if (res.data.actionItems?.length) setActions(res.data.actionItems);
      } else {
        setError("Couldn't get an answer just now. Try again in a moment.");
      }
    });
  };

  return (
    <section className="space-y-4 rounded-card border-[1.5px] border-line bg-panel p-5 shadow-card">
      <div>
        <h2 className="font-display text-[19px] font-semibold text-ink">Your daily brief</h2>
        <p className="mt-0.5 text-[13.5px] text-muted">Plain words about today, from your live numbers.</p>
      </div>

      <div className="text-[14.5px] leading-relaxed text-ink" aria-live="polite" aria-busy={pending}>
        <p className={pending ? "opacity-60" : undefined}>{answer}</p>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        {actions.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {actions.map((a) => (
              <Link
                key={a.href + a.label}
                href={a.href}
                className="inline-flex items-center gap-1 rounded-lg border-[1.5px] border-line bg-canvas px-3 py-1 text-[12.5px] font-semibold text-ink transition hover:border-ink"
              >
                {a.label} <ArrowUpRight aria-hidden className="size-3" />
              </Link>
            ))}
          </div>
        )}
      </div>

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
            className="rounded-full border-[1.5px] border-line bg-panel px-3.5 py-1.5 text-left text-[13px] font-semibold text-muted transition hover:border-ink hover:text-ink disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>

      <form
        className="flex flex-col gap-2 pt-1 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <label htmlFor="brief-question" className="sr-only">
          Ask about your orders, customers or WhatsApp costs
        </label>
        <input
          id="brief-question"
          className="field flex-1"
          placeholder="Ask about your orders, customers or WhatsApp costs…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button
          type="submit"
          disabled={!question.trim() || pending}
          className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-control bg-brand px-4 text-[14px] font-semibold text-on-brand transition hover:brightness-105 disabled:opacity-50"
        >
          <Sparkles aria-hidden className="size-4" /> Ask
        </button>
      </form>
    </section>
  );
}
