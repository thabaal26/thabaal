"use client";

// Admin panel › Settings › Who can sign in here: "Invite someone". The server checks the login is an admin.

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "@/components/toast";
import { inviteAdminLogin } from "../../dashboard/actions/admin-settings";

export function InviteAdmin() {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, start] = useTransition();

  return (
    <>
      <button type="button" className="btn sm" onClick={() => ref.current?.showModal()}>
        Invite someone
      </button>
      <dialog ref={ref} aria-labelledby="invite-admin-title" onClick={(e) => e.target === ref.current && ref.current?.close()}>
        <form
          className="dlg"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await inviteAdminLogin({ name, email });
              toast(r.ok, r.message);
              if (r.ok) {
                setName("");
                setEmail("");
                ref.current?.close();
                router.refresh();
              }
            });
          }}
        >
          <h2 id="invite-admin-title">Invite an admin</h2>
          <p className="muted small" style={{ marginTop: -6 }}>
            An admin sees every business and this whole panel, including prices and payments. Only invite people who work for Thabaal.
          </p>
          <div className="formgrid">
            <div className="field">
              <label htmlFor="inv-name">Name</label>
              <input id="inv-name" type="text" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="inv-email">Email</label>
              <input id="inv-email" type="email" required maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          <p className="muted small">They get an email with a link to set a password, or they can sign in with Google on this email.</p>
          <div className="acts">
            <button type="button" className="btn" onClick={() => ref.current?.close()} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? "Adding…" : "Send the invite"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
