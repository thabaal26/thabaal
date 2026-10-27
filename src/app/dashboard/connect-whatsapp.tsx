import { metaSignupUrl } from "@/lib/meta-signup";
import { getSettings } from "@/lib/provider";
import { senderFor } from "@/lib/senders";
import { getScope } from "@/lib/session";
import { ConnectLink } from "./connect-link";

/**
 * A banner on Home and My account for a business with no WhatsApp number connected yet (the same test the menu's
 * "WhatsApp not connected" uses, so a connected business never sees it). Thabaal's admin always gets the real button,
 * to try it. Business owners get it only once META_SIGNUP_LIVE=1 is set (after Meta approves the app); until then they
 * are told Thabaal will connect the number for them, because Meta's page would refuse them.
 */
export async function ConnectWhatsApp() {
  try {
    const scope = await getScope();
    if (!scope.clientId || !(scope.isAdmin || scope.manager)) return null;
    if ((await getSettings()).provider !== "META") return null;
    if (!(await senderFor(scope.clientId)).cfg.notConnected) return null;

    const showButton = scope.isAdmin || process.env.META_SIGNUP_LIVE === "1";
    return (
      <div className="card" style={{ marginBottom: 16, borderLeft: "6px solid var(--bar2)" }}>
        <div className="hd">
          <div>
            <h2 style={{ fontSize: 17 }}>Connect your WhatsApp</h2>
            <p className="muted small">
              {showButton
                ? scope.isAdmin
                  ? "Try Meta's sign-up for this business: sign in with Facebook, choose or create the WhatsApp account and add the number. The account then appears on Requests for you to attach. Until Meta approves the app, only people added to the Meta app can finish it."
                  : "Sign in with Facebook, choose or create your WhatsApp Business account, and add the number your customers will message. It takes about five minutes, and you can leave and come back."
                : "Campaigns, chats and orders start once your WhatsApp number is connected. Thabaal will connect it with you, so there is nothing to do here yet."}
            </p>
          </div>
          {showButton && <ConnectLink url={metaSignupUrl()} />}
        </div>
      </div>
    );
  } catch {
    return null;
  }
}
