import Link from "@/components/intent-link";
import { T } from "@/app/(portal)/dashboard/portal-ui";
import { ShieldCheck, Smartphone, Building2, CheckCircle2 } from "@/components/icons";

export type MetaPhoneNumber = {
  id: string;
  phoneNumberId: string;
  displayPhone: string | null;
  verifiedName: string | null;
  qualityRating: string | null;
  messagingTier: string | null;
  limit: number | null;
  isDefault?: boolean;
};

export type MetaBusinessConnectionData = {
  businessPortfolioId: string | null;
  businessPortfolioName: string | null;
  wabaId: string | null;
  fallbackPhoneNumberId: string | null;
  connectionStatus: "CONNECTED" | "CONFIGURATION_RECORDED" | "NOT_CONNECTED";
  verificationStatus: "VERIFIED" | "UNVERIFIED" | "PENDING";
  lastVerifiedAt: string | null;
  phoneNumbers: MetaPhoneNumber[];
};

interface Props {
  data: MetaBusinessConnectionData;
  canManageIntegration: boolean;
}

export function MetaBusinessConnectionCard({ data, canManageIntegration }: Props) {
  const quality = (r: string | null | undefined) => (
    r === "GREEN" ? { tone: "ok", label: "High quality", labelTa: "உயர்ந்த தரம்" }
    : r === "YELLOW" ? { tone: "warn", label: "Medium quality", labelTa: "நடுத்தர தரம்" }
    : r === "RED" ? { tone: "bad", label: "Low quality", labelTa: "குறைந்த தரம்" }
    : { tone: "mute", label: "Not rated yet", labelTa: "மதிப்பிடப்படவில்லை" }
  );

  const hasConfig = Boolean(data.wabaId || data.fallbackPhoneNumberId || data.phoneNumbers.length > 0);

  return (
    <section className="card" style={{ border: "1px solid var(--border, #e2e8f0)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
      <div className="hd" style={{ flexWrap: "wrap", gap: 12, alignItems: "center", borderBottom: "1px solid var(--border, #f1f5f9)", paddingBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "#e0f2fe",
              color: "#0284c7",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Building2 className="w-5 h-5 text-sky-600" />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                <T ta="Meta Business & WhatsApp இணைப்பு">Meta Business & WhatsApp Integration</T>
              </h2>
            </div>
            <p style={{ margin: "3px 0 0", fontSize: 13, color: "var(--muted, #64748b)" }}>
              <T ta="அதிகாரப்பூர்வ WhatsApp Business Account (WABA) மற்றும் இணைக்கப்பட்ட எண்கள்.">
                Official WhatsApp Business Account (WABA), Business Portfolio and verified phone numbers.
              </T>
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {hasConfig ? (
            <span className="pill ok" style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 12px", fontSize: 12, fontWeight: 600 }}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              <T ta="இணைக்கப்பட்டுள்ளது (Active)">● ACTIVE & RECORDED</T>
            </span>
          ) : (
            <span className="pill" style={{ padding: "5px 12px", fontSize: 12 }}>
              <T ta="இணைக்கப்படவில்லை">○ NOT CONNECTED</T>
            </span>
          )}

          {canManageIntegration && (
            <Link className="btn sm" href="/dashboard/settings/whatsapp">
              <T ta="அமைப்புகள்">Manage Integration</T>
            </Link>
          )}
        </div>
      </div>

      {/* Meta Asset Details Grid */}
      <div className="grid g3" style={{ marginTop: 16, marginBottom: 16, gap: 14 }}>
        <div className="stat" style={{ padding: 12, borderRadius: 8, background: "var(--soft, #f8fafc)" }}>
          <div className="l" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted, #64748b)" }}>
            <T ta="வணிகப் பெயர் (Business Portfolio)">Business Portfolio</T>
          </div>
          <div className="v" style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>
            {data.businessPortfolioName || "—"}
          </div>
          <div className="d muted" style={{ fontSize: 11, marginTop: 2 }}>
            {data.businessPortfolioId ? `ID: ${data.businessPortfolioId}` : <T ta="வணிகக் கணக்கு">Authorized Merchant Portfolio</T>}
          </div>
        </div>

        <div className="stat" style={{ padding: 12, borderRadius: 8, background: "var(--soft, #f8fafc)" }}>
          <div className="l" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted, #64748b)" }}>
            <T ta="WhatsApp Business Account (WABA)">WABA Account ID</T>
          </div>
          <div className="v" style={{ fontSize: 15, fontWeight: 700, fontFamily: "ui-monospace, monospace", marginTop: 4 }}>
            {data.wabaId || "—"}
          </div>
          <div className="d muted" style={{ fontSize: 11, marginTop: 2 }}>
            <T ta="Meta Cloud API கணக்கு">Meta Cloud API Asset</T>
          </div>
        </div>

        <div className="stat" style={{ padding: 12, borderRadius: 8, background: "var(--soft, #f8fafc)" }}>
          <div className="l" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--muted, #64748b)" }}>
            <T ta="இணைப்பு முறை">Integration Channel</T>
          </div>
          <div className="v" style={{ fontSize: 14, fontWeight: 600, color: "#059669", marginTop: 4, display: "flex", alignItems: "center", gap: 5 }}>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <T ta="Meta Cloud API (Official)">Meta Cloud API (Official)</T>
          </div>
          <div className="d muted" style={{ fontSize: 11, marginTop: 2 }}>
            <T ta="நேரடி Meta Cloud சர்வர்">Direct Meta Cloud Enterprise</T>
          </div>
        </div>
      </div>

      {/* Connected Phone Numbers List */}
      <div style={{ borderTop: "1px solid var(--border, #f1f5f9)", paddingTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
            <Smartphone className="w-4 h-4 text-slate-500" />
            <T ta="பதிவுசெய்யப்பட்ட WhatsApp எண்கள்">Registered WhatsApp Senders</T>
            <span style={{ fontSize: 11, background: "var(--soft, #e2e8f0)", padding: "1px 7px", borderRadius: 10 }}>
              {data.phoneNumbers.length > 0 ? data.phoneNumbers.length : data.fallbackPhoneNumberId ? 1 : 0}
            </span>
          </div>
          {data.lastVerifiedAt && (
            <span className="muted small" style={{ fontSize: 11 }}>
              <T ta={`சரிபார்க்கப்பட்டது: ${data.lastVerifiedAt}`}>{`Verified: ${data.lastVerifiedAt}`}</T>
            </span>
          )}
        </div>

        <div className="list">
          {data.phoneNumbers.length > 0 ? (
            data.phoneNumbers.map((n) => {
              const qy = quality(n.qualityRating);
              return (
                <div key={n.id} className="row" style={{ alignItems: "center", padding: "10px 12px", borderRadius: 8, background: "var(--soft, #f8fafc)", marginBottom: 6 }}>
                  <div className="grow">
                    <div className="t" style={{ fontWeight: 600, fontSize: 14 }}>
                      {n.verifiedName || data.businessPortfolioName || "WhatsApp Sender"}
                      {n.isDefault && (
                        <span className="muted small" style={{ marginLeft: 6, fontSize: 11 }}>
                          · <T ta="முதன்மை எண்">main sender</T>
                        </span>
                      )}
                    </div>
                    <div className="muted small" style={{ fontSize: 12, marginTop: 2, display: "flex", flexWrap: "wrap", gap: "6px 12px" }}>
                      <span><strong>{n.displayPhone ?? "Number attached"}</strong></span>
                      <span style={{ fontFamily: "ui-monospace, monospace" }}>ID: {n.phoneNumberId}</span>
                      {n.limit != null && (
                        <span>
                          · <T ta={`ஒரு நாளைக்கு ${n.limit.toLocaleString("en-IN")} வாடிக்கையாளர்கள் வரை`}>
                            {`up to ${n.limit.toLocaleString("en-IN")} customers/day`}
                          </T>
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`pill ${qy.tone}`} style={{ fontSize: 11, fontWeight: 600 }}>
                    <T ta={qy.labelTa}>{qy.label}</T>
                  </span>
                </div>
              );
            })
          ) : data.fallbackPhoneNumberId ? (
            <div className="row" style={{ alignItems: "center", padding: "10px 12px", borderRadius: 8, background: "var(--soft, #f8fafc)" }}>
              <div className="grow">
                <div className="t" style={{ fontWeight: 600, fontSize: 14 }}>
                  {data.businessPortfolioName || "WhatsApp Sender"}
                  <span className="muted small" style={{ marginLeft: 6, fontSize: 11 }}>
                    · <T ta="முதன்மை எண்">main sender</T>
                  </span>
                </div>
                <div className="muted small" style={{ fontSize: 12, marginTop: 2, display: "flex", flexWrap: "wrap", gap: "6px 12px" }}>
                  <span style={{ fontFamily: "ui-monospace, monospace" }}>Phone ID: {data.fallbackPhoneNumberId}</span>
                  <span>· <T ta="Meta Cloud API மூலம் இயக்கப்படுகிறது">Powered by Meta Cloud API</T></span>
                </div>
              </div>
              <span className="pill ok" style={{ fontSize: 11, fontWeight: 600 }}>
                <T ta="இயங்குகிறது">Active</T>
              </span>
            </div>
          ) : (
            <div className="py-2 text-center">
              <p className="muted small">
                <T ta="இன்னும் WhatsApp எண் இணைக்கப்படவில்லை.">No WhatsApp number configured yet.</T>
              </p>
              {canManageIntegration && (
                <Link className="btn btn-primary sm" href="/dashboard/settings/whatsapp/connect" style={{ marginTop: 6 }}>
                  <T ta="WhatsApp இணைக்கவும்">Connect WhatsApp →</T>
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
