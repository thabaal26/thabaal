import { attachedRecently, connectStartedRecently, metaSignupUrl } from "@/lib/meta-signup";
import { getSettings } from "@/lib/provider";
import { senderFor } from "@/lib/senders";
import { getScope } from "@/lib/session";
import { ConnectLink } from "./connect-link";

const VERIFY_NOTE =
  "Until your business is verified with Meta, your daily messaging limit stays low. Thabaal can guide you through that verification once you are connected.";

/**
 * A card on Home and My account about connecting WhatsApp, in three states:
 *  - not connected: what to have ready, and the button (the same "not connected" test the menu uses, so a connected
 *    business never sees it). Thabaal's admin always gets the real button, to try it. Business owners get it only once
 *    META_SIGNUP_LIVE=1 is set (after Meta approves the app); until then they are told Thabaal will connect the number
 *    for them, because Meta's page would refuse them.
 *  - waiting: the business pressed the button in the last day and Thabaal has not linked the account yet. Meta's hosted
 *    page never sends the customer back to us, so this is how they know what happens next.
 *  - connected: for a week after Thabaal attached the account.
 */
export async function ConnectWhatsApp() {
  try {
    const scope = await getScope();
    if (!scope.clientId || !(scope.isAdmin || scope.manager)) return null;
    if ((await getSettings()).provider !== "META") return null;
    const clientId = scope.clientId;

    if (!(await senderFor(clientId)).cfg.notConnected) {
      if (!(await attachedRecently(clientId))) return null;
      return (
        <div className="card" style={{ marginBottom: 16, borderLeft: "6px solid var(--ok)" }}>
          <div className="hd">
            <div>
              <h2 style={{ fontSize: 17 }}>WhatsApp is connected</h2>
              <p className="muted small">Your number is linked, so campaigns, chats and orders can now use it. {VERIFY_NOTE}</p>
            </div>
          </div>
        </div>
      );
    }

    const showButton = scope.isAdmin || process.env.META_SIGNUP_LIVE === "1";
    const waiting = showButton && (await connectStartedRecently(clientId));
    const url = metaSignupUrl();

    return (
      <div className="card" style={{ marginBottom: 16, borderLeft: "6px solid var(--bar2)" }}>
        <div className="hd">
          <div>
            <h2 style={{ fontSize: 17 }}>{waiting ? "Finish on Meta's page" : "Connect your WhatsApp"}</h2>
            {!showButton ? (
              <p className="muted small">Campaigns, chats and orders start once your WhatsApp number is connected. Thabaal will connect it with you, so there is nothing to do here yet.</p>
            ) : waiting ? (
              <p className="muted small">
                Meta&apos;s page opened in another tab. Finish it there. This card changes to Connected once Thabaal has linked your number, usually within one working day.
                If the tab was closed, open it again.
              </p>
            ) : (
              <>
                <p className="muted small">
                  {scope.isAdmin
                    ? "Try Meta's sign-up for this business. The account then appears on Requests for you to attach. Until Meta approves the app, only people added to the Meta app can finish it."
                    : "It takes about five minutes, and you can leave and come back. Have these ready:"}
                </p>
                {!scope.isAdmin && (
                  <ul className="muted small" style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                    <li>Your Facebook login (the one that manages your business)</li>
                    <li>Your business name</li>
                    <li>A phone number that is not used in the WhatsApp app or another WhatsApp Business account</li>
                    <li>That number&apos;s SIM, to receive a code by SMS or call</li>
                  </ul>
                )}
                <p className="muted small" style={{ marginTop: 6 }}>{VERIFY_NOTE}</p>
              </>
            )}
          </div>
          {showButton && <ConnectLink url={url} label={waiting ? "Open Meta's page again" : "Connect your WhatsApp"} />}
        </div>
      </div>
    );
  } catch {
    return null;
  }
}
