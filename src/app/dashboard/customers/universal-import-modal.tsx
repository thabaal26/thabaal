"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/sheet";
import { Badge, Button, Field } from "@/components/ui";
import {
  AlertCircle,
  Check,
  ChevronRight,
  FileUp,
  Loader2,
  RefreshCw,
  Sparkles,
  UsersRound,
  X,
} from "@/components/icons";
import { useLanguage } from "@/lib/i18n/context";
import {
  initImportSession,
  inspectImportBatch,
  confirmMappingAndStage,
  getImportBatchProgress,
  approveAndCommitBatch,
  cancelImportBatch,
} from "../actions/import";

const CONSENT_OPTIONS = [
  "Bought from our store / gave phone number at checkout",
  "Signed up at the shop or billing counter",
  "Messaged our WhatsApp Business number first",
  "Website or online ordering form",
  "Requested customer updates over the phone",
];

export function UniversalImportModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { lang } = useLanguage();
  const ta = lang === "ta";
  const router = useRouter();

  const [step, setStep] = useState<"UPLOAD" | "MAPPING" | "STAGING" | "REVIEW" | "COMMITTING" | "DONE">("UPLOAD");
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(CONSENT_OPTIONS[0]);
  const [tags, setTags] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Upload Progress
  const [uploadPercent, setUploadPercent] = useState(0);
  const [uploadStatus, setUploadStatus] = useState("");

  // Batch details
  const [batchId, setBatchId] = useState<string | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [sheets, setSheets] = useState<any[]>([]);
  const [selectedSheetIndex, setSelectedSheetIndex] = useState(0);

  // Column Mappings
  const [mapping, setMapping] = useState<Record<string, number>>({
    phone: -1,
    name: -1,
    location: -1,
    tags: -1,
  });

  // Overwrite options
  const [overwriteNames, setOverwriteNames] = useState(false);
  const [overwriteAreas, setOverwriteAreas] = useState(false);
  const [multiPhoneChoice, setMultiPhoneChoice] = useState<"PRIMARY_ONLY" | "HOLD">("PRIMARY_ONLY");

  // Reconciliation Metrics & Progress
  const [metrics, setMetrics] = useState<{
    total: number;
    valid: number;
    invalid: number;
    ambiguous: number;
    intraFileDups?: number;
    committedNew?: number;
    committedUpdated?: number;
  }>({ total: 0, valid: 0, invalid: 0, ambiguous: 0 });

  const [samples, setSamples] = useState<{
    valid: any[];
    invalid: any[];
    ambiguous: any[];
  }>({ valid: [], invalid: [], ambiguous: [] });

  const [isPending, startTransition] = useTransition();

  function resetState() {
    setStep("UPLOAD");
    setFile(null);
    setError(null);
    setUploadPercent(0);
    setUploadStatus("");
    setBatchId(null);
    setFileId(null);
    setSheets([]);
    setMetrics({ total: 0, valid: 0, invalid: 0, ambiguous: 0 });
    setSamples({ valid: [], invalid: [], ambiguous: [] });
  }

  function handleClose() {
    if (batchId && step !== "DONE") {
      cancelImportBatch(batchId).catch(() => {});
    }
    resetState();
    onClose();
  }

  // --- STEP 1: Upload via 2 MB Chunks ---
  async function handleStartUpload() {
    if (!file) return;
    setError(null);
    setUploadPercent(0);
    setUploadStatus(ta ? "கோப்பு துவங்குகிறது..." : "Initializing upload session...");

    try {
      const ext = file.name.split(".").pop() || "csv";
      const tagList = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const initRes = await initImportSession({
        files: [{ originalFileName: file.name, fileSize: file.size, fileFormat: ext }],
        optInSource: consent,
        defaultTags: tagList,
      });

      if (!initRes.ok || !initRes.data) {
        throw new Error(initRes.message || "Failed to initialize import session");
      }

      const currentBatchId = initRes.data.batchId;
      const targetFile = initRes.data.files[0];
      setBatchId(currentBatchId);
      setFileId(targetFile.id);

      const chunkSize = targetFile.chunkSize;
      const totalChunks = targetFile.totalChunks;

      for (let i = 0; i < totalChunks; i++) {
        const offset = i * chunkSize;
        const slice = file.slice(offset, Math.min(offset + chunkSize, file.size));
        const arrayBuf = await slice.arrayBuffer();

        setUploadStatus(
          ta
            ? `துண்டு ${i + 1}/${totalChunks} பதிவேற்றப்படுகிறது...`
            : `Uploading chunk ${i + 1} of ${totalChunks}...`
        );

        const res = await fetch("/api/import/upload/chunk", {
          method: "POST",
          headers: {
            "x-import-batch-id": currentBatchId,
            "x-import-file-id": targetFile.id,
            "x-chunk-index": String(i),
            "x-chunk-total": String(totalChunks),
            "x-chunk-offset": String(offset),
            "x-chunk-size": String(slice.size),
            "content-type": "application/octet-stream",
          },
          body: arrayBuf,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: "Chunk upload failed" }));
          throw new Error(errData.error || `Chunk ${i + 1} failed`);
        }

        const pct = Math.round(((i + 1) / totalChunks) * 100);
        setUploadPercent(pct);
      }

      setUploadStatus(ta ? "நெடுவரிசைகள் பகுப்பாய்வு செய்யப்படுகின்றன..." : "Analyzing spreadsheet columns...");
      const inspectRes = await inspectImportBatch(currentBatchId);

      if (!inspectRes.ok || !inspectRes.data) {
        throw new Error(inspectRes.message || "Failed to inspect spreadsheet");
      }

      setSheets(inspectRes.data.sheets);
      if (inspectRes.data.sheets.length > 0) {
        const firstSheet = inspectRes.data.sheets[0];
        setMapping({
          phone: firstSheet.detectedColumns.phone ?? -1,
          name: firstSheet.detectedColumns.name ?? -1,
          location: firstSheet.detectedColumns.location ?? -1,
          tags: firstSheet.detectedColumns.tags ?? -1,
        });
      }

      setStep("MAPPING");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred during upload.");
    }
  }

  // --- STEP 2: Staging Confirmation ---
  async function handleConfirmMapping() {
    if (!batchId || !fileId) return;
    if (mapping.phone < 0) {
      setError(ta ? "தயவுசெய்து மொபைல் எண் நெடுவரிசையைத் தேர்ந்தெடுக்கவும்." : "Please select the WhatsApp/Phone column.");
      return;
    }

    setError(null);
    setStep("STAGING");

    startTransition(async () => {
      try {
        const curSheet = sheets[selectedSheetIndex] || { headerRowIndex: 0 };
        const stageRes = await confirmMappingAndStage(
          batchId,
          fileId,
          curSheet.headerRowIndex ?? 0,
          mapping,
          { overwriteNames, overwriteAreas, selectedSheet: curSheet.name }
        );

        if (!stageRes.ok || !stageRes.data) {
          throw new Error(stageRes.message || "Staging failed");
        }

        setMetrics({
          total: stageRes.data.total,
          valid: stageRes.data.valid,
          invalid: stageRes.data.invalid,
          ambiguous: stageRes.data.ambiguous,
        });

        // Fetch detailed preview samples
        const progressRes = await getImportBatchProgress(batchId);
        if (progressRes.ok && progressRes.data) {
          setSamples({
            valid: progressRes.data.sampleValid || [],
            invalid: progressRes.data.sampleInvalid || [],
            ambiguous: progressRes.data.sampleAmbiguous || [],
          });
        }

        setStep("REVIEW");
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Staging failed.");
        setStep("MAPPING");
      }
    });
  }

  // --- STEP 3: Ingestion Commit ---
  async function handleApproveCommit() {
    if (!batchId) return;
    setError(null);
    setStep("COMMITTING");

    startTransition(async () => {
      try {
        const commitRes = await approveAndCommitBatch(batchId);
        if (!commitRes.ok || !commitRes.data) {
          throw new Error(commitRes.message || "Commit failed");
        }

        setMetrics((prev) => ({
          ...prev,
          committedNew: commitRes.data?.committedNew ?? 0,
          committedUpdated: commitRes.data?.committedUpdated ?? 0,
        }));

        setStep("DONE");
        router.refresh();
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Failed to commit customers to database.");
        setStep("REVIEW");
      }
    });
  }

  const curSheet = sheets[selectedSheetIndex];
  const colHeaders: string[] = curSheet?.headers || [];

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      title={
        step === "UPLOAD"
          ? ta ? "வாடிக்கையாளர் மொத்த இறக்குமதி" : "Universal Bulk Customer Import"
          : step === "MAPPING"
          ? ta ? "நெடுவரிசை பொருத்தம் (Column Mapping)" : "Confirm Column Mapping"
          : step === "STAGING"
          ? ta ? "சரிபார்க்கப்படுகிறது..." : "Staging & Verifying Records..."
          : step === "REVIEW"
          ? ta ? "இறக்குமதி மறுஆய்வு (Reconciliation)" : "Import Reconciliation & Review"
          : step === "COMMITTING"
          ? ta ? "சேமிக்கப்படுகிறது..." : "Ingesting into Directory..."
          : ta ? "இறக்குமதி முடிந்தது" : "Import Completed Successfully"
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="flex items-start gap-2.5 rounded-card border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-400">
            <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">{ta ? "பிழை ஏற்பட்டது" : "Action Required"}</p>
              <p>{error}</p>
            </div>
            <button type="button" onClick={() => setError(null)} className="text-muted hover:text-ink">
              <X className="size-4" />
            </button>
          </div>
        )}

        {/* STEP 1: FILE PICKER & CONSENT */}
        {step === "UPLOAD" && (
          <div className="space-y-4 text-xs">
            <label className="flex cursor-pointer flex-col items-center gap-2.5 rounded-card border-2 border-dashed border-line-strong/60 px-4 py-8 text-center transition hover:border-brand hover:bg-brand-soft/30">
              <FileUp aria-hidden className="size-8 text-brand-deep" />
              <div>
                <p className="text-sm font-semibold text-ink">
                  {file ? file.name : ta ? "எக்செல் அல்லது CSV கோப்பை தேர்ந்தெடுக்கவும்" : "Drop spreadsheet or click to browse"}
                </p>
                <p className="mt-1 text-muted">
                  {file
                    ? `${(file.size / 1024 / 1024).toFixed(2)} MB · ${file.name.split(".").pop()?.toUpperCase()}`
                    : ta
                    ? ".xlsx, .xls, .csv, .tsv, .ods, .zip (200,000 பதிவுகள் வரை ஆதரிக்கப்படுகிறது)"
                    : ".xlsx, .xls, .csv, .tsv, .ods, .zip up to 250 MB (200,000+ rows supported)"}
                </p>
              </div>
              <input
                type="file"
                className="sr-only"
                accept=".xlsx,.xls,.csv,.tsv,.ods,.xlsm,.zip,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setFile(f);
                }}
              />
            </label>

            <Field
              id="opt-in"
              label={ta ? "வாடிக்கையாளர் ஒப்புதல் ஆதாரம் (Meta விதிமுறை)" : "Customer Opt-In Consent Source (Meta Compliance)"}
              hint={ta ? "வாட்ஸ்அப் விளம்பர விதிமுறைகளுக்கு இது கட்டாயம்" : "Required by WhatsApp Business Policy"}
              required
            >
              <input
                list="consent-choices"
                className="field text-xs"
                value={consent}
                onChange={(e) => setConsent(e.target.value)}
                placeholder="e.g. Bought from store and gave phone number"
              />
            </Field>
            <datalist id="consent-choices">
              {CONSENT_OPTIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>

            <Field
              id="tags-opt"
              label={ta ? "கூடுதல் குறிச்சொற்கள் (Tags)" : "Default Campaign Tags"}
              hint={ta ? "காற்புள்ளியால் பிரிக்கவும் (விரும்பினால்)" : "Comma-separated (optional)"}
            >
              <input
                className="field text-xs"
                placeholder="e.g. retail, diwali-2026, madurai-south"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
            </Field>

            {uploadPercent > 0 && (
              <div className="space-y-1.5 rounded-card border border-line bg-panel p-3">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-muted">{uploadStatus}</span>
                  <span className="font-mono text-brand-deep">{uploadPercent}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-sunken">
                  <div
                    className="h-full bg-brand transition-all duration-200"
                    style={{ width: `${uploadPercent}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={handleClose}>
                {ta ? "ரத்துசெய்" : "Cancel"}
              </Button>
              <Button
                type="button"
                disabled={!file || !consent.trim() || uploadPercent > 0}
                loading={uploadPercent > 0}
                onClick={handleStartUpload}
              >
                <ChevronRight aria-hidden className="size-4 shrink-0" />
                {ta ? "அடுத்த கட்டம்: நெடுவரிசை சரிபார்ப்பு" : "Upload & Analyze Columns"}
              </Button>
            </div>
          </div>
        )}

        {/* STEP 2: COLUMN MAPPING & CONFLICT RULES */}
        {step === "MAPPING" && (
          <div className="space-y-4 text-xs">
            {sheets.length > 1 && (
              <Field id="sheet-picker" label={ta ? "தாள் தேர்வு (Sheet)" : "Select Sheet to Import"}>
                <select
                  className="field text-xs"
                  value={selectedSheetIndex}
                  onChange={(e) => {
                    const idx = Number(e.target.value);
                    setSelectedSheetIndex(idx);
                    const s = sheets[idx];
                    if (s) {
                      setMapping({
                        phone: s.detectedColumns.phone ?? -1,
                        name: s.detectedColumns.name ?? -1,
                        location: s.detectedColumns.location ?? -1,
                        tags: s.detectedColumns.tags ?? -1,
                      });
                    }
                  }}
                >
                  {sheets.map((s, idx) => (
                    <option key={idx} value={idx}>
                      {s.sheetName} ({s.totalRows?.toLocaleString()} rows)
                    </option>
                  ))}
                </select>
              </Field>
            )}

            <div className="rounded-card border border-line bg-panel p-3.5 space-y-3">
              <p className="font-semibold text-ink flex items-center gap-1.5">
                <Sparkles className="size-4 text-brand-deep" />
                {ta ? "நெடுவரிசைகளை உறுதிப்படுத்தவும்" : "Match Columns to Customer Fields"}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field id="map-phone" label={ta ? "வாட்ஸ்அப் எண் (Phone)" : "WhatsApp Phone"} required>
                  <select
                    className="field text-xs"
                    value={mapping.phone}
                    onChange={(e) => setMapping({ ...mapping, phone: Number(e.target.value) })}
                  >
                    <option value={-1}>{ta ? "-- நெடுவரிசையை தேர்ந்தெடுக்கவும் --" : "-- Select Column --"}</option>
                    {colHeaders.map((col, idx) => (
                      <option key={idx} value={idx}>
                        Col {idx + 1}: {col || `[Empty ${idx + 1}]`}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field id="map-name" label={ta ? "வாடிக்கையாளர் பெயர் (Name)" : "Customer Name"}>
                  <select
                    className="field text-xs"
                    value={mapping.name}
                    onChange={(e) => setMapping({ ...mapping, name: Number(e.target.value) })}
                  >
                    <option value={-1}>{ta ? "-- விரும்பினால் தேர்ந்தெடுக்கவும் --" : "-- Optional / None --"}</option>
                    {colHeaders.map((col, idx) => (
                      <option key={idx} value={idx}>
                        Col {idx + 1}: {col || `[Empty ${idx + 1}]`}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field id="map-location" label={ta ? "பகுதி / ஊர் (Area/Locality)" : "Area / Locality"}>
                  <select
                    className="field text-xs"
                    value={mapping.location}
                    onChange={(e) => setMapping({ ...mapping, location: Number(e.target.value) })}
                  >
                    <option value={-1}>{ta ? "-- விரும்பினால் தேர்ந்தெடுக்கவும் --" : "-- Optional / None --"}</option>
                    {colHeaders.map((col, idx) => (
                      <option key={idx} value={idx}>
                        Col {idx + 1}: {col || `[Empty ${idx + 1}]`}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field id="map-tags" label={ta ? "வகை / குறிச்சொல் (Category/Tags)" : "Tags / Category"}>
                  <select
                    className="field text-xs"
                    value={mapping.tags}
                    onChange={(e) => setMapping({ ...mapping, tags: Number(e.target.value) })}
                  >
                    <option value={-1}>{ta ? "-- விரும்பினால் தேர்ந்தெடுக்கவும் --" : "-- Optional / None --"}</option>
                    {colHeaders.map((col, idx) => (
                      <option key={idx} value={idx}>
                        Col {idx + 1}: {col || `[Empty ${idx + 1}]`}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>

            {/* Field Conflict Safeguards */}
            <div className="rounded-card border border-line bg-panel p-3 space-y-2 text-xs">
              <p className="font-semibold text-ink">
                {ta ? "ஏற்கனவே உள்ள வாடிக்கையாளர்கள் மீதான விதிகள்" : "Existing Customer Update Rules"}
              </p>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 rounded border-line"
                  checked={overwriteNames}
                  onChange={(e) => setOverwriteNames(e.target.checked)}
                />
                <span>
                  {ta
                    ? "கோப்பில் புதிய பெயர் இருந்தால் பழைய பெயரை மாற்றவும் (அணைக்கப்பட்டால் பழைய பெயர் பாதுகாக்கப்படும்)"
                    : "Update customer name if a different name is given in this spreadsheet (safe default: keep existing)"}
                </span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 rounded border-line"
                  checked={overwriteAreas}
                  onChange={(e) => setOverwriteAreas(e.target.checked)}
                />
                <span>
                  {ta
                    ? "கோப்பில் புதிய முகவரி/பகுதி இருந்தால் பழைய பகுதியை மாற்றவும்"
                    : "Update customer area/locality if provided in this spreadsheet"}
                </span>
              </label>
            </div>

            <div className="flex justify-between gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setStep("UPLOAD")}>
                {ta ? "பின்செல்" : "Back"}
              </Button>
              <Button
                type="button"
                disabled={mapping.phone < 0 || isPending}
                loading={isPending}
                onClick={handleConfirmMapping}
              >
                {ta ? "சரிபார்த்து மேடைக்கு ஏற்று (Stage Records)" : "Validate & Stage Records"}
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: STAGING SPINNER */}
        {step === "STAGING" && (
          <div className="py-12 text-center space-y-3">
            <Loader2 className="size-8 animate-spin mx-auto text-brand-deep" />
            <p className="font-semibold text-ink text-sm">
              {ta ? "பதிவுகள் சரிபார்க்கப்பட்டு மேடையில் வைக்கப்படுகின்றன..." : "Streaming, parsing and validating records..."}
            </p>
            <p className="text-xs text-muted max-w-sm mx-auto">
              {ta
                ? "தொலைபேசி எண்கள் E.164 தரநிலைக்கு மாற்றப்படுகின்றன, இரட்டை பதிவுகள் மற்றும் பிழையான எண்கள் கண்டறியப்படுகின்றன."
                : "Validating phone digits to E.164, detecting duplicate rows, and isolating invalid numbers with zero silent data loss."}
            </p>
          </div>
        )}

        {/* STEP 4: RECONCILIATION LEDGER & AMBIGUOUS RESOLUTION */}
        {step === "REVIEW" && (
          <div className="space-y-4 text-xs">
            {/* 100% MECE Row Accounting Ledger */}
            <div className="rounded-card border border-line bg-panel p-4 space-y-3">
              <p className="font-semibold text-ink text-sm flex items-center justify-between">
                <span>{ta ? "முழுமையான வரிசை கணக்கீடு (100% MECE Ledger)" : "100% MECE Row Reconciliation Ledger"}</span>
                <Badge tone="blue">{metrics.total.toLocaleString()} rows inspected</Badge>
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-card border border-emerald-500/30 bg-emerald-500/10 p-2.5">
                  <p className="text-muted text-[11px]">{ta ? "செல்லுபடியாகும் எண்கள்" : "Valid Candidates"}</p>
                  <p className="text-base font-bold text-emerald-700 dark:text-emerald-400">
                    {metrics.valid.toLocaleString()}
                  </p>
                </div>

                <div className="rounded-card border border-amber-500/30 bg-amber-500/10 p-2.5">
                  <p className="text-muted text-[11px]">{ta ? "பல எண்கள் உள்ளவை" : "Multi-Phone Rows"}</p>
                  <p className="text-base font-bold text-amber-700 dark:text-amber-400">
                    {metrics.ambiguous.toLocaleString()}
                  </p>
                </div>

                <div className="rounded-card border border-rose-500/30 bg-rose-500/10 p-2.5">
                  <p className="text-muted text-[11px]">{ta ? "பிழையான எண்கள்" : "Invalid Numbers"}</p>
                  <p className="text-base font-bold text-rose-700 dark:text-rose-400">
                    {metrics.invalid.toLocaleString()}
                  </p>
                </div>

                <div className="rounded-card border border-line bg-sunken p-2.5">
                  <p className="text-muted text-[11px]">{ta ? "இணைக்கப்படும் மொத்த நபர்கள்" : "Ready to Ingest"}</p>
                  <p className="text-base font-bold text-ink">
                    {metrics.valid.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Ambiguous Multi-Phone Handling Choice */}
            {metrics.ambiguous > 0 && (
              <div className="rounded-card border border-amber-500/35 bg-amber-500/10 p-3 space-y-2">
                <p className="font-semibold text-ink flex items-center gap-1.5">
                  <AlertCircle className="size-4 text-amber-600 shrink-0" />
                  {ta
                    ? `${metrics.ambiguous} வரிசைகளில் ஒன்றுக்கு மேற்பட்ட எண்கள் உள்ளன ("98653 10945 / 90805 53061")`
                    : `${metrics.ambiguous} rows contain multiple phone numbers in a single cell`}
                </p>
                <p className="text-muted">
                  {ta
                    ? "இவற்றை எவ்வாறு கையாள விரும்புகிறீர்கள்?"
                    : "How would you like to process these multi-phone records?"}
                </p>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="multiphone-choice"
                      checked={multiPhoneChoice === "PRIMARY_ONLY"}
                      onChange={() => setMultiPhoneChoice("PRIMARY_ONLY")}
                    />
                    <span>
                      {ta
                        ? "முதல் சரியான எண்ணை முதன்மை வாடிக்கையாளராக சேர்க்கவும் (பாதுகாப்பானது)"
                        : "Ingest the first valid number as the customer's active WhatsApp phone"}
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="multiphone-choice"
                      checked={multiPhoneChoice === "HOLD"}
                      onChange={() => setMultiPhoneChoice("HOLD")}
                    />
                    <span>
                      {ta
                        ? "நிலுவையில் வைத்து பின்னர் ஒருவரேவா அல்லது இருவரா என உறுதிப்படுத்தவும்"
                        : "Hold in Pending Customers list for manual verification"}
                    </span>
                  </label>
                </div>
              </div>
            )}

            {/* Sample Preview Tables */}
            {samples.valid.length > 0 && (
              <div className="space-y-1.5">
                <p className="font-semibold text-ink text-[11px] text-muted">
                  {ta ? "செல்லுபடியாகும் பதிவுகளின் மாதிரி:" : "Sample Valid Records:"}
                </p>
                <div className="rounded-card border border-line divide-y divide-line overflow-hidden">
                  {samples.valid.slice(0, 3).map((r, i) => (
                    <div key={i} className="flex justify-between p-2 bg-panel">
                      <span className="font-medium text-ink">{r.name || "(No Name)"}</span>
                      <span className="font-mono text-muted">+{r.normalizedPhone}</span>
                      <span className="text-muted">{r.location || "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={handleClose}>
                {ta ? "ரத்துசெய்" : "Cancel"}
              </Button>
              <Button
                type="button"
                disabled={metrics.valid === 0 || isPending}
                loading={isPending}
                onClick={handleApproveCommit}
              >
                <Check aria-hidden className="size-4 shrink-0" />
                {ta
                  ? `${metrics.valid.toLocaleString()} வாடிக்கையாளர்களை இறக்குமதி செய்`
                  : `Approve & Ingest ${metrics.valid.toLocaleString()} Customers`}
              </Button>
            </div>
          </div>
        )}

        {/* STEP 5: COMMITTING SPINNER */}
        {step === "COMMITTING" && (
          <div className="py-12 text-center space-y-3">
            <Loader2 className="size-8 animate-spin mx-auto text-brand-deep" />
            <p className="font-semibold text-ink text-sm">
              {ta ? "வாடிக்கையாளர் பட்டியலில் இணைக்கப்படுகிறது..." : "Ingesting into production Customer directory..."}
            </p>
            <p className="text-xs text-muted max-w-sm mx-auto">
              {ta
                ? "அதிவேக SQL மூலம் பதிவுகள் சேர்க்கப்படுகின்றன. விலகிய வாடிக்கையாளர்கள் மற்றும் ஒப்புதல்கள் பாதுகாக்கப்படுகின்றன."
                : "Executing high-speed set-based SQL upserts. Preserving opt-out states, consent history, and tag unions."}
            </p>
          </div>
        )}

        {/* STEP 6: DONE CONFIRMATION */}
        {step === "DONE" && (
          <div className="py-8 text-center space-y-4 text-xs">
            <div className="size-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
              <Check className="size-6" />
            </div>
            <div>
              <p className="font-bold text-ink text-base">
                {ta ? "இறக்குமதி வெற்றிகரமாக முடிந்தது!" : "Import Completed Successfully!"}
              </p>
              <p className="text-muted mt-1">
                {ta
                  ? `${metrics.committedNew ?? metrics.valid} புதிய வாடிக்கையாளர்கள் சேர்க்கப்பட்டனர். ${metrics.committedUpdated ?? 0} பதிவுகள் புதுப்பிக்கப்பட்டன.`
                  : `${metrics.committedNew ?? metrics.valid} new customers added. ${metrics.committedUpdated ?? 0} existing records updated.`}
              </p>
            </div>
            <div className="pt-2">
              <Button type="button" onClick={handleClose}>
                {ta ? "முடிந்தது" : "Done"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
