import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface TemplateRenderSnapshotV1 {
  schemaVersion: 1;
  template: {
    name: string;
    language: string;
    category: string | null;
  };
  header?: {
    kind: "TEXT" | "IMAGE" | "VIDEO" | "DOCUMENT";
    text?: string;
    media?: {
      providerMediaId?: string;
      storageKey?: string;
      mimeType?: string;
      filename?: string;
    };
  };
  body: {
    text: string;
    parameters: Array<{
      index?: number;
      name?: string;
      type: string;
      resolvedValue: string;
    }>;
  };
  footer?: {
    text: string;
  };
  buttons: Array<{
    index: number;
    type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER" | "COPY_CODE" | "ORDER_DETAILS" | "CATALOG" | string;
    label: string;
    resolvedUrl?: string;
    phoneNumber?: string;
    quickReplyPayload?: string;
  }>;
}

export interface PreparedTemplateSnapshot {
  tenantId: string;
  messageId: string;
  wabaId: string;
  phoneNumberId: string;
  graphApiVersion: string;
  providerTemplateId?: string | null;
  templateName: string;
  languageCode: string;
  category?: string | null;
  sourceTemplateVersionId?: string | null;
  templateDefinition: JsonValue;
  requestPayload: JsonValue;
  renderSnapshot: TemplateRenderSnapshotV1;
}

/**
 * Canonicalizes JSON recursively: sorted object keys, preserved array ordering.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Invalid non-finite JSON number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const entries = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
  return `{${entries.join(",")}}`;
}

export function sha256Json(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

/**
 * Persists immutable template snapshot in atomic transaction with Message.
 * NO update or upsert method: snapshots are strictly append-only.
 */
export async function createSentTemplateSnapshot(
  tx: Prisma.TransactionClient,
  input: PreparedTemplateSnapshot
) {
  if (input.templateDefinition === null || typeof input.templateDefinition !== "object" || Array.isArray(input.templateDefinition)) {
    throw new Error("Invalid template definition JSON");
  }
  if (input.requestPayload === null || typeof input.requestPayload !== "object" || Array.isArray(input.requestPayload)) {
    throw new Error("Invalid template request JSON");
  }
  if (
    input.renderSnapshot.schemaVersion !== 1 ||
    input.renderSnapshot.template.name !== input.templateName ||
    input.renderSnapshot.template.language !== input.languageCode
  ) {
    throw new Error("Template render snapshot identity mismatch");
  }

  const definitionSha256 = sha256Json(input.templateDefinition);
  const requestSha256 = sha256Json(input.requestPayload);
  const renderSha256 = sha256Json(input.renderSnapshot as unknown as JsonValue);

  return (tx as any).sentTemplateSnapshot.create({
    data: {
      tenantId: input.tenantId,
      messageId: input.messageId,
      provider: "META_CLOUD_API",
      wabaId: input.wabaId,
      phoneNumberId: input.phoneNumberId,
      graphApiVersion: input.graphApiVersion,
      providerTemplateId: input.providerTemplateId ?? null,
      templateName: input.templateName,
      languageCode: input.languageCode,
      category: input.category ?? null,
      sourceTemplateVersionId: input.sourceTemplateVersionId ?? null,
      templateDefinition: input.templateDefinition as Prisma.InputJsonValue,
      requestPayload: input.requestPayload as Prisma.InputJsonValue,
      renderSnapshot: input.renderSnapshot as unknown as Prisma.InputJsonValue,
      definitionSha256,
      requestSha256,
      renderSha256,
      schemaVersion: 1,
    },
  });
}

export type HistoricalTemplateResult =
  | { source: "SNAPSHOT"; snapshot: TemplateRenderSnapshotV1 }
  | { source: "LEGACY_CAPTURE"; snapshot: TemplateRenderSnapshotV1 }
  | { source: "UNAVAILABLE" }
  | { source: "INTEGRITY_ERROR" };

export interface StoredSnapshotForRendering {
  schemaVersion: number;
  renderSnapshot: unknown;
  renderSha256: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isTemplateRenderSnapshotV1(value: unknown): value is TemplateRenderSnapshotV1 {
  if (!isRecord(value) || value.schemaVersion !== 1) return false;
  if (!isRecord(value.template) || typeof value.template.name !== "string" || typeof value.template.language !== "string") return false;
  if (!isRecord(value.body) || typeof value.body.text !== "string" || !Array.isArray(value.body.parameters) || !Array.isArray(value.buttons)) return false;
  return true;
}

/**
 * Historical resolver:
 * 1. Checks SNAPSHOT and validates cryptographic SHA-256 hash.
 * 2. If null, falls back to LEGACY_CAPTURE (persisted message body).
 * 3. Never attempts dynamic reconstruction from today's Meta template.
 */
export function resolveHistoricalTemplate(
  stored: StoredSnapshotForRendering | null,
  legacyCapture: TemplateRenderSnapshotV1 | null
): HistoricalTemplateResult {
  if (stored !== null) {
    if (stored.schemaVersion !== 1 || !isTemplateRenderSnapshotV1(stored.renderSnapshot)) {
      return { source: "INTEGRITY_ERROR" };
    }
    const actualHash = sha256Json(stored.renderSnapshot);
    if (actualHash !== stored.renderSha256) {
      return { source: "INTEGRITY_ERROR" };
    }
    return { source: "SNAPSHOT", snapshot: stored.renderSnapshot };
  }
  if (legacyCapture !== null && isTemplateRenderSnapshotV1(legacyCapture)) {
    return { source: "LEGACY_CAPTURE", snapshot: legacyCapture };
  }
  return { source: "UNAVAILABLE" };
}
