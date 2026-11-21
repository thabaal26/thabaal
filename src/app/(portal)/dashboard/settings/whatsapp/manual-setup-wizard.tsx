"use client";

import { useState, useTransition } from "react";
import {
  validateMetaAppInput,
  validateWabaAccess,
  fetchWabaPhoneNumbers,
  saveManualWhatsAppConnection,
  type WabaPhoneNumberOption,
} from "@/app/dashboard/actions/whatsapp-connect";

interface Props {
  clientId?: string;
  initialVerifyToken?: string;
}

export function ManualSetupWizard({ clientId, initialVerifyToken }: Props) {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [token, setToken] = useState("");
  const [graphVersion, setGraphVersion] = useState("v23.0");
  const [wabaName, setWabaName] = useState("");
  const [phoneOptions, setPhoneOptions] = useState<WabaPhoneNumberOption[]>([]);
  const [selectedNumbers, setSelectedNumbers] = useState<
    { phoneNumberId: string; label: string; isDefault?: boolean }[]
  >([]);
  const [verifyToken, setVerifyToken] = useState(initialVerifyToken || "thabaal_webhook_secret_2026");
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [summaryData, setSummaryData] = useState<{
    wabaName: string;
    appId: string;
    wabaId: string;
    numbers: string[];
  } | null>(null);

  const callbackUrl = typeof window !== "undefined" ? `${window.location.origin}/api/webhook` : "https://www.thabaal.in/api/webhook";

  // Step 1 -> Step 2
  const handleValidateApp = () => {
    setError(null);
    startTransition(async () => {
      const res = await validateMetaAppInput(appId, appSecret);
      if (!res.ok) {
        setError(res.message || "Invalid Meta App details.");
        return;
      }
      setStep(2);
    });
  };

  // Step 2 -> Step 3
  const handleValidateWaba = () => {
    setError(null);
    startTransition(async () => {
      const res = await validateWabaAccess(wabaId, token, graphVersion);
      if (!res.ok || !res.data) {
        setError(res.message || "Could not validate WABA access.");
        return;
      }
      setWabaName(res.data.name);

      const numRes = await fetchWabaPhoneNumbers(wabaId, token, graphVersion);
      if (!numRes.ok || !numRes.data) {
        setError(numRes.message || "Could not fetch phone numbers.");
        return;
      }
      setPhoneOptions(numRes.data);
      if (numRes.data.length > 0) {
        setSelectedNumbers([{ phoneNumberId: numRes.data[0].id, label: numRes.data[0].verifiedName || "Main", isDefault: true }]);
      }
      setStep(3);
    });
  };

  // Step 3 -> Step 4
  const handleConfirmNumbers = () => {
    if (selectedNumbers.length === 0) {
      setError("Please select at least one phone number to connect.");
      return;
    }
    setError(null);
    setStep(4);
  };

  // Step 4 -> Step 5 & 6 (Save & Complete)
  const handleSaveConnection = () => {
    setError(null);
    setStep(5);
    startTransition(async () => {
      const res = await saveManualWhatsAppConnection({
        clientId,
        appId,
        appSecret,
        wabaId,
        token,
        graphVersion,
        verifyToken,
        selectedPhoneNumbers: selectedNumbers,
      });

      if (!res.ok) {
        setError(res.message || "Connection validation failed.");
        setStep(4);
        return;
      }

      setSummaryData({
        wabaName: wabaName || "WhatsApp Business",
        appId,
        wabaId,
        numbers: selectedNumbers.map((s) => s.label),
      });
      setStep(6);
    });
  };

  const copyText = (text: string, type: "url" | "token") => {
    navigator.clipboard.writeText(text);
    if (type === "url") {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } else {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    }
  };

  return (
    <div className="card space-y-6">
      {/* Progress Indicators */}
      <div className="flex items-center justify-between border-b pb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span className={step >= 1 ? "text-primary font-bold" : ""}>1. Meta App</span>
        <span>→</span>
        <span className={step >= 2 ? "text-primary font-bold" : ""}>2. WABA Token</span>
        <span>→</span>
        <span className={step >= 3 ? "text-primary font-bold" : ""}>3. Numbers</span>
        <span>→</span>
        <span className={step >= 4 ? "text-primary font-bold" : ""}>4. Webhook</span>
        <span>→</span>
        <span className={step >= 5 ? "text-primary font-bold" : ""}>5. Verify</span>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* STEP 1: Meta App Details */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-semibold">Step 1 — Meta Developer App Details</h3>
            <p className="text-sm text-muted-foreground">
              Enter your Meta App credentials. Find these in{" "}
              <a
                href="https://developers.facebook.com/apps"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                Meta for Developers › Your App › App settings › Basic
              </a>.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Meta App ID</label>
              <input
                type="text"
                placeholder="e.g. 1633333557630357"
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                className="mt-1 w-full rounded border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Meta App Secret</label>
              <input
                type="password"
                placeholder="e.g. 32-character hexadecimal secret"
                value={appSecret}
                onChange={(e) => setAppSecret(e.target.value)}
                className="mt-1 w-full rounded border px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button
              onClick={handleValidateApp}
              disabled={isPending || !appId || !appSecret}
              className="btn btn-primary"
            >
              {isPending ? "Validating..." : "Continue to WhatsApp Credentials →"}
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: WhatsApp Credentials */}
      {step === 2 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-semibold">Step 2 — WhatsApp Credentials</h3>
            <p className="text-sm text-muted-foreground">
              Provide your permanent System User Access Token and WhatsApp Business Account (WABA) ID.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground">WhatsApp Business Account ID (WABA ID)</label>
              <input
                type="text"
                placeholder="e.g. 1465822505685652"
                value={wabaId}
                onChange={(e) => setWabaId(e.target.value)}
                className="mt-1 w-full rounded border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Graph API Version</label>
              <select
                value={graphVersion}
                onChange={(e) => setGraphVersion(e.target.value)}
                className="mt-1 w-full rounded border px-3 py-2 text-sm"
              >
                <option value="v23.0">v23.0 (Recommended)</option>
                <option value="v22.0">v22.0</option>
                <option value="v21.0">v21.0</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground">System User Permanent Access Token</label>
              <textarea
                rows={3}
                placeholder="e.g. EAAX..."
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="mt-1 w-full rounded border px-3 py-2 font-mono text-xs"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Requires permissions: <code>whatsapp_business_messaging</code> and <code>whatsapp_business_management</code>.
              </p>
            </div>
          </div>
          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(1)} className="btn">
              ← Back
            </button>
            <button
              onClick={handleValidateWaba}
              disabled={isPending || !wabaId || !token}
              className="btn btn-primary"
            >
              {isPending ? "Validating with Meta..." : "Verify WABA & Fetch Numbers →"}
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Phone Numbers Selection */}
      {step === 3 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-semibold">Step 3 — Select Phone Numbers</h3>
            <p className="text-sm text-muted-foreground">
              Found {phoneOptions.length} registered number(s) under <strong>{wabaName}</strong>. Select the numbers to connect to Thabaal.
            </p>
          </div>
          <div className="space-y-3">
            {phoneOptions.map((opt) => {
              const isSelected = selectedNumbers.some((s) => s.phoneNumberId === opt.id);
              return (
                <div
                  key={opt.id}
                  className={`flex items-center justify-between rounded border p-3 ${
                    isSelected ? "border-primary bg-primary/5" : "border-border"
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={Boolean(opt.alreadyAssignedTo)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedNumbers([...selectedNumbers, { phoneNumberId: opt.id, label: opt.verifiedName || "Main" }]);
                        } else {
                          setSelectedNumbers(selectedNumbers.filter((s) => s.phoneNumberId !== opt.id));
                        }
                      }}
                      className="h-4 w-4 rounded"
                    />
                    <div>
                      <div className="font-medium text-sm">
                        {opt.displayPhoneNumber} {opt.verifiedName ? `(${opt.verifiedName})` : ""}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Phone ID: {opt.id} · Quality: {opt.qualityRating || "UNKNOWN"}
                      </div>
                      {opt.alreadyAssignedTo && (
                        <span className="text-xs text-amber-600">Already assigned to {opt.alreadyAssignedTo}</span>
                      )}
                    </div>
                  </div>
                  {isSelected && (
                    <input
                      type="text"
                      placeholder="Label (e.g. Main)"
                      value={selectedNumbers.find((s) => s.phoneNumberId === opt.id)?.label || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedNumbers(
                          selectedNumbers.map((s) =>
                            s.phoneNumberId === opt.id ? { ...s, label: val } : s
                          )
                        );
                      }}
                      className="rounded border px-2 py-1 text-xs"
                    />
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(2)} className="btn">
              ← Back
            </button>
            <button onClick={handleConfirmNumbers} className="btn btn-primary">
              Continue to Webhook Setup →
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: Webhook Configuration */}
      {step === 4 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-semibold">Step 4 — Configure Meta Webhooks</h3>
            <p className="text-sm text-muted-foreground">
              Copy these webhook parameters into your Meta App dashboard under WhatsApp › Configuration.
            </p>
          </div>
          <div className="space-y-3 rounded bg-muted/40 p-4 text-sm">
            <div>
              <div className="flex justify-between">
                <span className="font-semibold text-xs text-muted-foreground">Callback URL:</span>
                <button
                  type="button"
                  onClick={() => copyText(callbackUrl, "url")}
                  className="text-xs text-primary underline"
                >
                  {copiedUrl ? "Copied!" : "Copy"}
                </button>
              </div>
              <code className="block mt-1 break-all rounded bg-background p-2 font-mono text-xs">
                {callbackUrl}
              </code>
            </div>
            <div>
              <div className="flex justify-between">
                <span className="font-semibold text-xs text-muted-foreground">Verify Token:</span>
                <button
                  type="button"
                  onClick={() => copyText(verifyToken, "token")}
                  className="text-xs text-primary underline"
                >
                  {copiedToken ? "Copied!" : "Copy"}
                </button>
              </div>
              <code className="block mt-1 break-all rounded bg-background p-2 font-mono text-xs">
                {verifyToken}
              </code>
            </div>
            <div className="pt-2 text-xs text-muted-foreground">
              📌 Important: In Meta App dashboard, subscribe to the <strong>messages</strong> webhook field.
            </div>
          </div>
          <div className="flex justify-between pt-2">
            <button onClick={() => setStep(3)} className="btn">
              ← Back
            </button>
            <button
              onClick={handleSaveConnection}
              disabled={isPending}
              className="btn btn-primary"
            >
              {isPending ? "Validating & Activating..." : "Validate & Activate Connection ✓"}
            </button>
          </div>
        </div>
      )}

      {/* STEP 5: Verification in Progress */}
      {step === 5 && (
        <div className="py-8 text-center space-y-3">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent" />
          <h3 className="text-base font-semibold">Validating Connection with Meta...</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            Verifying token scopes, checking WABA asset ownership, subscribing webhooks, and securing credentials.
          </p>
        </div>
      )}

      {/* STEP 6: Connection Summary */}
      {step === 6 && summaryData && (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            ✓
          </div>
          <h3 className="text-lg font-bold">WhatsApp Successfully Connected!</h3>
          <p className="text-sm text-muted-foreground">
            Connected to <strong>{summaryData.wabaName}</strong>. Outbound messages, campaigns, and incoming replies are now active.
          </p>
          <div className="rounded border bg-muted/20 p-4 text-left text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">WABA ID:</span>
              <span className="font-mono">{summaryData.wabaId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Meta App ID:</span>
              <span className="font-mono">{summaryData.appId}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phone Numbers:</span>
              <span>{summaryData.numbers.join(", ")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status:</span>
              <span className="font-bold text-emerald-600">ACTIVE</span>
            </div>
          </div>
          <div className="pt-2">
            <a href="/dashboard/settings/whatsapp" className="btn btn-primary">
              Return to WhatsApp Settings
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
