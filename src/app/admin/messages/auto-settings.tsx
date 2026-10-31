"use client";

// Admin panel › Messages › Automatic messages: payment reminders and their timing, quiet hours; plus sending the
// two templates to Meta and cancelling a scheduled message. The server checks the login is an admin.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "@/components/toast";
import type { OwnerMsgSettings } from "@/lib/owner-messages-core";
import { cancelOwnerMessageAction, saveOwnerMessageSettings, submitOwnerTemplatesAction } from "../../dashboard/actions/owner-messages";

function Switch({ on, label, onChange }: { on: boolean; label: string; onChange: (v: boolean) => void }) {
  return <button type="button" className="sw" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}

export function AutoSettings({ initial, grace }: { initial: OwnerMsgSettings; grace: number }) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [busy, start] = useTransition();
  const set = <K extends keyof OwnerMsgSettings>(k: K) => (v: OwnerMsgSettings[K]) => setS((x) => ({ ...x, [k]: v }));
  const save = () =>
    start(async () => {
      const r = await saveOwnerMessageSettings(s);
      toast(r.ok, r.message);
      if (r.ok) router.refresh();
    });
  const timing: [keyof OwnerMsgSettings, string][] = [
    ["before3", "Three days before the plan ends"],
    ["onDay", "On the day it ends"],
    ["dayAfter", "The day after, if still unpaid"],
    ["weekLater", "A week later, then stop"],
  ];

  return (
    <>
      <div className="card mb16">
        <div className="hd">
          <div>
            <h2>Messages that send themselves</h2>
            <p>Switch one on and thabaal handles it for every shop, every time.</p>
          </div>
        </div>
        <div className="list">
          <div className="row">
            <div className="grow">
              <div className="t">Payment reminders</div>
              <div className="muted small">
                Before and after a plan ends, to shops that must pay and are not on auto-pay. Each shop gets each reminder once. After {grace} grace days thabaal locks.
              </div>
            </div>
            <Switch on={s.reminders} label="Payment reminders" onChange={set("reminders")} />
          </div>
        </div>
      </div>
      <div className="g2x mb16">
        <div className="card">
          <div className="hd">
            <div>
              <h2>Reminder timing</h2>
              <p>When a payment reminder goes out.</p>
            </div>
          </div>
          <div className="list">
            {timing.map(([k, label]) => (
              <div className="row" key={k}>
                <div className="grow">{label}</div>
                <Switch on={s[k] as boolean} label={label} onChange={(v) => setS((x) => ({ ...x, [k]: v }))} />
              </div>
            ))}
          </div>
          <p className="muted small" style={{ marginTop: 12 }}>
            Four reminders is the most anyone should get. After that, call them.
          </p>
        </div>
        <div className="card">
          <div className="hd">
            <div>
              <h2>Quiet hours</h2>
              <p>Nothing is sent outside these times.</p>
            </div>
          </div>
          <div className="formgrid">
            <div className="field">
              <label htmlFor="msq1">From</label>
              <input id="msq1" type="time" value={s.quietFrom} onChange={(e) => set("quietFrom")(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="msq2">Until</label>
              <input id="msq2" type="time" value={s.quietTo} onChange={(e) => set("quietTo")(e.target.value)} />
            </div>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <div className="grow">Skip Sundays</div>
            <Switch on={s.skipSundays} label="Skip Sundays" onChange={set("skipSundays")} />
          </div>
        </div>
      </div>
      <div className="tools mb16">
        <button type="button" className="btn primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        <span className="muted small">Switches take effect when you save.</span>
      </div>
    </>
  );
}

export function SubmitTemplates() {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <button
      type="button"
      className="btn sm"
      disabled={busy}
      onClick={() =>
        start(async () => {
          const r = await submitOwnerTemplatesAction();
          toast(r.ok, r.message);
          if (r.ok) router.refresh();
        })
      }
    >
      {busy ? "Sending…" : "Send the templates to Meta"}
    </button>
  );
}

export function CancelScheduled({ id }: { id: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <button
      type="button"
      className="btn sm"
      disabled={busy}
      onClick={() =>
        start(async () => {
          const r = await cancelOwnerMessageAction(id);
          toast(r.ok, r.message);
          if (r.ok) router.refresh();
        })
      }
    >
      Cancel
    </button>
  );
}
