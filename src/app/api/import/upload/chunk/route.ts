import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { requireManager } from "@/lib/session";
import { getSpoolFilePath, computeFileSha256 } from "@/lib/import-storage";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const s = await requireManager(true);
    if ("denied" in s) {
      return NextResponse.json({ ok: false, message: s.denied }, { status: 403 });
    }

    const formData = await req.formData();
    const batchId = String(formData.get("batchId") || "");
    const fileId = String(formData.get("fileId") || "");
    const chunkIndex = parseInt(String(formData.get("chunkIndex") || "0"), 10);
    const totalChunks = parseInt(String(formData.get("totalChunks") || "1"), 10);
    const chunkSize = parseInt(String(formData.get("chunkSize") || "2097152"), 10);
    const chunkChecksum = String(formData.get("chunkChecksum") || "");
    const chunkFile = formData.get("chunk") as File | null;

    if (!batchId || !fileId || !chunkFile) {
      return NextResponse.json({ ok: false, message: "Missing batchId, fileId, or chunk data" }, { status: 400 });
    }

    // Tenant Isolation Assertion
    const batch = await db.importBatch.findFirst({
      where: { id: batchId, clientId: s.clientId },
      include: { files: true },
    });
    if (!batch) {
      return NextResponse.json({ ok: false, message: "Import batch not found or unauthorized" }, { status: 404 });
    }
    if (batch.status !== "UPLOADING") {
      return NextResponse.json({ ok: false, message: `Batch is not in UPLOADING state (current: ${batch.status})` }, { status: 409 });
    }

    const fileRecord = batch.files.find((f) => f.id === fileId);
    if (!fileRecord) {
      return NextResponse.json({ ok: false, message: "Import file not found in batch" }, { status: 404 });
    }

    const chunkBuffer = Buffer.from(await chunkFile.arrayBuffer());

    // Validate chunk checksum
    if (chunkChecksum) {
      const actualChecksum = crypto.createHash("sha256").update(chunkBuffer).digest("hex");
      if (actualChecksum.toLowerCase() !== chunkChecksum.toLowerCase()) {
        return NextResponse.json({ ok: false, message: `Chunk ${chunkIndex} checksum mismatch` }, { status: 400 });
      }
    }

    // Write chunk to specific byte offset on disk
    const targetPath = getSpoolFilePath(s.clientId, batch.id, fileRecord.id);
    const offset = chunkIndex * chunkSize;

    const fd = fs.openSync(targetPath, fs.existsSync(targetPath) ? "r+" : "w+");
    try {
      fs.writeSync(fd, chunkBuffer, 0, chunkBuffer.length, offset);
    } finally {
      fs.closeSync(fd);
    }

    // Check if this file is complete
    const stat = fs.statSync(targetPath);
    const isFileComplete = chunkIndex === totalChunks - 1 && stat.size >= fileRecord.fileSize;

    let fileChecksum = "";
    if (isFileComplete) {
      fileChecksum = await computeFileSha256(targetPath);
      await db.importFile.update({
        where: { id: fileRecord.id },
        data: {
          status: "UPLOADED",
          checksum: fileChecksum,
          storagePath: targetPath,
        },
      });
    }

    // Check if all files in the batch are uploaded
    const remainingPendingFiles = await db.importFile.count({
      where: { batchId: batch.id, status: { not: "UPLOADED" } },
    });
    const isBatchComplete = remainingPendingFiles === 0;

    if (isBatchComplete && batch.status === "UPLOADING") {
      await db.importBatch.update({
        where: { id: batch.id },
        data: { status: "UPLOADED" },
      });
    }

    return NextResponse.json({
      ok: true,
      chunkIndex,
      fileComplete: isFileComplete,
      batchComplete: isBatchComplete,
    });
  } catch (error: any) {
    console.error("Chunk upload error:", error);
    return NextResponse.json({ ok: false, message: error.message || "Failed to process upload chunk" }, { status: 500 });
  }
}
