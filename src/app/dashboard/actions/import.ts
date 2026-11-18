"use server";

import { db } from "@/lib/db";
import { requireManager, requireUser } from "@/lib/session";
import { checkTenantSpoolQuota, getSpoolFilePath, purgeBatchDir } from "@/lib/import-storage";
import { inspectFileStructure, stageImportFile, commitImportBatch } from "@/lib/import-engine";
import { revalidatePath } from "next/cache";

export type ActionResult<T = unknown> = { ok: true; data?: T; message?: string } | { ok: false; message: string };

/** Initializes an import batch and registers files for chunked upload */
export async function initImportSession(payload: {
  files: { originalFileName: string; fileSize: number; fileFormat: string }[];
  optInSource: string;
  defaultTags?: string[];
}): Promise<ActionResult<{ batchId: string; files: { id: string; originalFileName: string; chunkSize: number; totalChunks: number }[] }>> {
  const s = await requireManager(true);
  if ("denied" in s) return { ok: false, message: s.denied };
  const user = await requireUser();

  if (!payload.optInSource || !payload.optInSource.trim()) {
    return { ok: false, message: "Note how these customers agreed to receive WhatsApp messages (Meta compliance requirement)." };
  }
  if (!payload.files || !payload.files.length) {
    return { ok: false, message: "No files provided for upload." };
  }

  // Check quota across all files
  const totalIncomingBytes = payload.files.reduce((sum, f) => sum + f.fileSize, 0);
  const quota = checkTenantSpoolQuota(s.clientId, totalIncomingBytes);
  if (!quota.ok) return { ok: false, message: quota.message || "Disk quota exceeded." };

  const CHUNK_SIZE = 2 * 1024 * 1024; // 2 MB per chunk

  const batch = await db.importBatch.create({
    data: {
      clientId: s.clientId,
      userId: user.id,
      idempotencyKey: `${s.clientId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      optInSource: payload.optInSource.trim(),
      defaultTags: payload.defaultTags || [],
      totalFiles: payload.files.length,
      status: "UPLOADING",
      files: {
        create: payload.files.map((f) => ({
          clientId: s.clientId,
          originalFileName: f.originalFileName,
          safeStoredFileName: `${Date.now()}_${f.originalFileName.replace(/[^a-zA-Z0-9._-]/g, "")}`,
          fileFormat: f.fileFormat.toUpperCase(),
          fileSize: f.fileSize,
          checksum: "",
          storagePath: "",
          status: "PENDING",
        })),
      },
    },
    include: { files: true },
  });

  return {
    ok: true,
    data: {
      batchId: batch.id,
      files: batch.files.map((f) => ({
        id: f.id,
        originalFileName: f.originalFileName,
        chunkSize: CHUNK_SIZE,
        totalChunks: Math.ceil(f.fileSize / CHUNK_SIZE),
      })),
    },
  };
}

/** Inspects assembled files in a batch and suggests bilingual column mappings */
export async function inspectImportBatch(batchId: string): Promise<ActionResult<{ batchId: string; sheets: any[] }>> {
  const s = await requireManager(true);
  if ("denied" in s) return { ok: false, message: s.denied };

  const batch = await db.importBatch.findFirst({
    where: { id: batchId, clientId: s.clientId },
    include: { files: true },
  });
  if (!batch) return { ok: false, message: "Import batch not found." };
  if (!batch.files.length) return { ok: false, message: "No files found in batch." };

  const primaryFile = batch.files[0];
  const spoolPath = getSpoolFilePath(s.clientId, batch.id, primaryFile.id);

  try {
    const sheets = await inspectFileStructure(spoolPath, primaryFile.fileFormat);
    await db.importBatch.update({
      where: { id: batch.id },
      data: { status: "MAPPING_DUE" },
    });
    return { ok: true, data: { batchId: batch.id, sheets } };
  } catch (e: any) {
    console.error("Inspection failed:", e);
    return { ok: false, message: `Failed to inspect spreadsheet: ${e.message}` };
  }
}

/** Confirms column mapping and stages all records in memory-bounded batches */
export async function confirmMappingAndStage(
  batchId: string,
  fileId: string,
  headerRowIndex: number,
  mapping: Record<string, number>,
  options: { overwriteNames?: boolean; overwriteAreas?: boolean; selectedSheet?: string } = {}
): Promise<ActionResult<{ total: number; valid: number; invalid: number; ambiguous: number }>> {
  const s = await requireManager(true);
  if ("denied" in s) return { ok: false, message: s.denied };

  const batch = await db.importBatch.findFirst({
    where: { id: batchId, clientId: s.clientId },
    include: { files: true },
  });
  if (!batch) return { ok: false, message: "Batch not found." };

  const BATCH_TTL_MS = 24 * 60 * 60 * 1000;
  if (Date.now() - batch.createdAt.getTime() > BATCH_TTL_MS) {
    return { ok: false, message: "Import draft has expired (24-hour limit). Please upload a fresh file." };
  }

  const file = batch.files.find((f) => f.id === fileId) || batch.files[0];
  if (!file) return { ok: false, message: "File not found in batch." };

  const spoolPath = getSpoolFilePath(s.clientId, batch.id, file.id);

  await db.importBatch.update({
    where: { id: batch.id },
    data: {
      status: "STAGING",
      overwriteNames: options.overwriteNames ?? false,
      overwriteAreas: options.overwriteAreas ?? false,
    },
  });

  try {
    const result = await stageImportFile(
      batch.id,
      file.id,
      s.clientId,
      spoolPath,
      file.fileFormat,
      headerRowIndex,
      mapping,
      batch.defaultTags,
      options.selectedSheet
    );
    return { ok: true, data: result };
  } catch (e: any) {
    console.error("Staging error:", e);
    await db.importBatch.update({
      where: { id: batch.id },
      data: { status: "FAILED", errorMessage: e.message },
    });
    return { ok: false, message: `Staging error: ${e.message}` };
  }
}

/** Fetches real-time staging progress and metrics for the approval screen */
export async function getImportBatchProgress(batchId: string): Promise<ActionResult<any>> {
  const s = await requireManager(true);
  if ("denied" in s) return { ok: false, message: s.denied };

  const batch = await db.importBatch.findFirst({
    where: { id: batchId, clientId: s.clientId },
    include: {
      files: true,
      errors: { take: 20, orderBy: { createdAt: "desc" } },
    },
  });
  if (!batch) return { ok: false, message: "Batch not found." };

  // Sample staged rows for preview
  const sampleValid = await db.importStagingRecord.findMany({
    where: { batchId, classification: { in: ["VALID_SINGLE_NEW", "VALID_SINGLE_EXISTING"] } },
    take: 5,
  });

  const sampleInvalid = await db.importStagingRecord.findMany({
    where: { batchId, classification: "INVALID_RECORD" },
    take: 5,
  });

  const sampleAmbiguous = await db.importStagingRecord.findMany({
    where: { batchId, classification: "AMBIGUOUS_MULTI_PHONE" },
    take: 5,
  });

  return {
    ok: true,
    data: {
      batch,
      sampleValid,
      sampleInvalid,
      sampleAmbiguous,
    },
  };
}

/** Commits staged records into production Customer table */
export async function approveAndCommitBatch(batchId: string): Promise<ActionResult<{ committedNew: number; committedUpdated: number }>> {
  const s = await requireManager(true);
  if ("denied" in s) return { ok: false, message: s.denied };

  const batch = await db.importBatch.findFirst({ where: { id: batchId, clientId: s.clientId } });
  if (!batch) return { ok: false, message: "Import batch not found." };

  const BATCH_TTL_MS = 24 * 60 * 60 * 1000;
  if (Date.now() - batch.createdAt.getTime() > BATCH_TTL_MS) {
    return { ok: false, message: "Import draft has expired (24-hour limit). Please re-upload." };
  }

  try {
    const res = await commitImportBatch(batchId, s.clientId);
    // Purge temporary disk file upon successful commit
    purgeBatchDir(s.clientId, batchId);
    revalidatePath("/dashboard", "layout");
    return { ok: true, data: res, message: `Successfully imported ${res.committedNew} new customers and updated ${res.committedUpdated} existing records.` };
  } catch (e: any) {
    console.error("Commit error:", e);
    return { ok: false, message: `Commit error: ${e.message}` };
  }
}

/** Cancels a batch and deletes temporary spool files */
export async function cancelImportBatch(batchId: string): Promise<ActionResult> {
  const s = await requireManager(true);
  if ("denied" in s) return { ok: false, message: s.denied };

  await db.importBatch.updateMany({
    where: { id: batchId, clientId: s.clientId },
    data: { status: "CANCELLED" },
  });
  purgeBatchDir(s.clientId, batchId);
  return { ok: true, message: "Import cancelled." };
}
