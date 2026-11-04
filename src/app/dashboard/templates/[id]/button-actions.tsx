"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Zap } from "@/components/icons";
import { Button, Card, CardHeader, Field } from "@/components/ui";
import { safeAction, toastResult } from "@/components/toast";
import { ACTION_LABEL, ACTIONS, type ActionKind } from "@/lib/engine/keys";
import { removeButtonAction, saveButtonAction } from "../../actions/automation";

// Templates › a template › what each quick-reply button does when a customer taps it (lib/engine). The business saves
// an action per button; the label only describes it. Off (legacy) businesses can set these up before they go live.

type Saved = { buttonKey: string; action: string; value: string | null; replyText: string | null; enabled: boolean };
type Decision = { at: string; label: string; action: string; mode: string; executed: boolean };

const MODE_NOTE: Record<string, string> = {
  legacy: "Automatic actions are off for your business, so taps still get the built-in replies. You can set them up now; Thabaal turns them on with you.",
  shadow: "Testing: when a customer taps, Thabaal notes what your action would do (below) while they still get the built-in reply.",
  engine: "On: a tap runs the action you saved. Buttons without one get the built-in reply.",
};

function ButtonRow({ templateId, button, saved }: { templateId: string; button: { key: string; text: string }; saved?: Saved }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [action, setAction] = useState<ActionKind | "">((saved?.action as ActionKind) ?? "");
  const [value, setValue] = useState(saved?.value ?? "");
  const [replyText, setReplyText] = useState(saved?.replyText ?? "");
  const id = `ba-${button.key}`;
  const save = () =>
    start(async () => {
      if (!action) return;
      const r = await safeAction(() => saveButtonAction(templateId, button.key, { action, value, replyText }));
      toastResult(r);
      if (r.ok) router.refresh();
    });
  const remove = () =>
    start(async () => {
      const r = await safeAction(() => removeButtonAction(templateId, button.key));
      toastResult(r);
      if (r.ok) {
        setAction("");
        setValue("");
        setReplyText("");
        router.refresh();
      }
    });
  return (
    <li className="space-y-3 rounded-control border border-line p-3" data-testid={`button-action-${button.key}`}>
      <p className="text-sm font-semibold text-ink">
        “{button.text}” <span className="font-normal text-muted">{saved ? `· ${ACTION_LABEL[saved.action as ActionKind]?.en ?? saved.action}` : "· built-in reply"}</span>
      </p>
      <Field id={`${id}-a`} label="When tapped">
        <select
          className="field"
          value={action}
          onChange={(e) => {
            setAction(e.target.value as ActionKind);
            setValue(e.target.value === "opt_out" ? "offers" : e.target.value === "builtin" ? "catalogue" : "");
          }}
        >
          <option value="">Built-in reply (no action saved)</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {ACTION_LABEL[a].en}: {ACTION_LABEL[a].hint}
            </option>
          ))}
        </select>
      </Field>
      {action === "reply" && (
        <Field id={`${id}-v`} label="Reply" hint="{name} and {shop} are filled in">
          <textarea className="field min-h-24" maxLength={1000} placeholder="Thanks {name}! Here's what we have today…" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
      )}
      {action === "tag" && (
        <Field id={`${id}-v`} label="Tag">
          <input className="field" placeholder="interested" value={value} onChange={(e) => setValue(e.target.value)} />
        </Field>
      )}
      {action === "opt_out" && (
        <Field id={`${id}-v`} label="Stop">
          <select className="field" value={value} onChange={(e) => setValue(e.target.value)}>
            <option value="offers">Offers only (order messages still reach them)</option>
            <option value="all">All messages</option>
          </select>
        </Field>
      )}
      {action === "builtin" && (
        <Field id={`${id}-v`} label="Built-in reply">
          <select className="field" value={value} onChange={(e) => setValue(e.target.value)}>
            <option value="catalogue">Send your catalogue</option>
            <option value="reorder">Offer their last order again (catalogue if none)</option>
          </select>
        </Field>
      )}
      {(action === "tag" || action === "opt_out" || action === "handoff") && (
        <Field id={`${id}-r`} label="Message to the customer" hint="optional; a short default is sent">
          <input className="field" maxLength={1000} placeholder={action === "handoff" ? "Thanks! Someone from {shop} will reply to you here soon." : ""} value={replyText} onChange={(e) => setReplyText(e.target.value)} />
        </Field>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {saved && (
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={remove}>
            Use built-in reply
          </Button>
        )}
        <Button type="button" size="sm" loading={pending} disabled={!action} onClick={save}>
          Save action
        </Button>
      </div>
    </li>
  );
}

export function ButtonActions({
  templateId,
  buttons,
  saved,
  mode,
  decisions,
}: {
  templateId: string;
  buttons: { key: string; text: string }[];
  saved: Saved[];
  mode: string;
  decisions: Decision[];
}) {
  if (!buttons.length) return null;
  return (
    <Card className="card-3d mt-5" data-testid="button-actions">
      <CardHeader tone="gold" icon={<Zap aria-hidden className="size-5" />} title="When a customer taps a button" description={MODE_NOTE[mode] ?? MODE_NOTE.legacy} />
      <div className="space-y-4 p-4 sm:p-5">
        <ul className="list-none space-y-3 p-0">
          {buttons.map((b) => (
            <ButtonRow key={b.key} templateId={templateId} button={b} saved={saved.find((s) => s.buttonKey === b.key)} />
          ))}
        </ul>
        {decisions.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted">Latest taps</p>
            <ul className="list-none space-y-1 p-0 text-sm" data-testid="engine-decisions">
              {decisions.map((d, k) => (
                <li key={k} className="flex flex-wrap gap-x-2 text-ink-2">
                  <span className="tabular text-xs text-muted">{d.at}</span>
                  <span>{d.label}</span>
                  <span className="text-muted">→ {d.executed ? d.action : `${d.action} (${d.mode === "shadow" ? "test only" : "not done"})`}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
