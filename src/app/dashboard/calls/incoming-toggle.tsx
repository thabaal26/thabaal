"use client";

import { useState, useTransition } from "react";
import { Phone, PhoneOff } from "@/components/icons";
import { safeAction, toastResult } from "@/components/toast";
import { setIncomingCallsAction } from "../actions/calls";
import { T } from "../portal-ui";

/**
 * Chats › Calls: one switch for "customers can call us on WhatsApp". The state shown is what Meta has for the
 * business's number (read on the server); a change is sent to Meta and read back.
 */
export function IncomingCallsToggle({ initial, canManage, connected }: { initial: "on" | "off" | null; canManage: boolean; connected: boolean }) {
  const [state, setState] = useState(initial);
  const [pending, start] = useTransition();
  const on = state === "on";
  const known = state !== null;

  const flip = () =>
    start(async () => {
      const next = !on;
      setState(next ? "on" : "off");
      const r = await safeAction(() => setIncomingCallsAction(next));
      toastResult(r);
      if (r.ok && "state" in r && r.state) setState(r.state);
      else if (!r.ok) setState(initial === null ? null : on ? "on" : "off");
    });

  const Icon = on ? Phone : PhoneOff;
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span
          aria-hidden
          style={{
            flex: "none",
            display: "grid",
            placeItems: "center",
            width: 46,
            height: 46,
            borderRadius: 14,
            background: on ? "var(--ok-bg)" : "var(--soft)",
            color: on ? "var(--ok)" : "var(--muted)",
            transition: "background .2s, color .2s",
          }}
        >
          <Icon className="size-5" />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: 17, margin: 0 }} id="incoming-calls-label">
            <T ta="வரும் வாட்ஸ்அப் அழைப்புகள்">Incoming WhatsApp calls</T>
          </h2>
          <p className="muted small" style={{ margin: "2px 0 0" }} aria-live="polite">
            {!connected ? (
              <T ta="அழைப்புகளை நிர்வகிக்க உங்கள் வாட்ஸ்அப் எண்ணை இணைக்கவும்.">Connect your WhatsApp number to manage calls.</T>
            ) : !known ? (
              <T ta="வாட்ஸ்அப்பிலிருந்து இந்த அமைப்பை இப்போது படிக்க முடியவில்லை.">Couldn&apos;t read this setting from WhatsApp just now.</T>
            ) : on ? (
              <T ta="இயக்கத்தில்: வாடிக்கையாளர்கள் வாட்ஸ்அப்பில் உங்களை அழைக்கலாம்.">On: customers can call you from WhatsApp.</T>
            ) : (
              <T ta="அணைக்கப்பட்டது: அழைப்பு பட்டன் மறைக்கப்பட்டுள்ளது. அனுமதி தந்த வாடிக்கையாளர்களை நீங்கள் இன்னும் அழைக்கலாம்.">
                Off: the call button is hidden, so customers can&apos;t call you. You can still call customers who allowed calls.
              </T>
            )}
          </p>
          {connected && !canManage && (
            <p className="muted small" style={{ margin: "2px 0 0" }}>
              <T ta="உரிமையாளர் அல்லது மேலாளர் மட்டுமே இதை மாற்ற முடியும்.">Only the owner or a manager can change this.</T>
            </p>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="incoming-calls-label"
          className="sw"
          disabled={!connected || !canManage || pending}
          onClick={flip}
        />
      </div>
    </div>
  );
}
