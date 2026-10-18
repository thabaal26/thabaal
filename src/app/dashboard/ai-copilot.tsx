"use client";
import { safeAction } from "@/components/toast";

import { ArrowUpRight, Sparkles } from "@/components/icons";
import Link from "@/components/intent-link";
import { useState, useTransition } from "react";
import { askAiBusinessCopilotAction } from "./actions/ai";
import { T } from "./portal-ui";

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
      const res = await safeAction(() => askAiBusinessCopilotAction(query));
      if (res.ok && res.data) {
        setAnswer(res.data.answer);
        if (res.data.actionItems?.length) setActions(res.data.actionItems);
      } else {
        setError("Couldn't get an answer just now. Try again in a moment.");
      }
    });
  };

  return (
    <section className="card">
      <div className="hd">
        <div>
          <h2>
            <T ta="உங்கள் தினசரி சுருக்கம்">Your daily brief</T>
          </h2>
          <p>
            <T ta="இன்று முதலில் செய்ய வேண்டியவை, உங்கள் நேரடி எண்களிலிருந்து.">What to do first today, worked out from your live numbers.</T>
          </p>
        </div>
      </div>

      <div aria-live="polite" aria-busy={pending}>
        <p style={pending ? { opacity: 0.6 } : undefined}>{answer}</p>
        {error && (
          <p className="msg err" style={{ marginTop: 8 }}>
            {error}
          </p>
        )}
        {actions.length > 0 && (
          <div className="tools" style={{ marginTop: 12 }}>
            {actions.map((a) => (
              <Link key={a.href + a.label} href={a.href} className="btn sm">
                {a.label} <ArrowUpRight aria-hidden className="ic shrink-0" style={{ width: 14, height: 14 }} />
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="chips" style={{ marginTop: 14 }}>
        {QUICK_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            className="chip"
            disabled={pending}
            onClick={() => {
              setQuestion(q);
              ask(q);
            }}
          >
            {q}
          </button>
        ))}
      </div>

      <form
        className="toolbar"
        style={{ marginTop: 12, marginBottom: 0 }}
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
      >
        <label htmlFor="brief-question" className="hx">
          Ask about your orders, customers or WhatsApp costs
        </label>
        <input
          id="brief-question"
          type="text"
          style={{ flex: 1, minWidth: 200 }}
          placeholder="Ask about your orders, customers or WhatsApp costs…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        <button type="submit" className="btn primary" disabled={!question.trim() || pending}>
          <Sparkles aria-hidden className="ic shrink-0" /> Ask
        </button>
      </form>
    </section>
  );
}
