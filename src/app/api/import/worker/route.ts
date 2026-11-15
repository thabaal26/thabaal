import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { stageImportFile, commitImportBatch } from "@/lib/import-engine";
import { getSpoolFilePath, purgeBatchDir } from "@/lib/import-storage";
import { sessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Dedicated Background Worker for Bulk Customer Imports.
 * Safely processes staging and set-based commits in an asynchronous,
 * memory-bounded pipeline without blocking Meta campaigns or webhooks.
 */
async function handleWorker(req: NextRequest) {
  // Authorization: Bearer CRON_SECRET or authenticated Manager user
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization") ?? "";
  const authBuf = Buffer.from(authHeader);
  const wantBuf = Buffer.from(`Bearer ${secret ?? ""}`);

  const isCronAuthed = secret && authBuf.length === wantBuf.length && timingSafeEqual(authBuf, wantBuf);
  let isUserAuthed = false;

  if (!isCronAuthed) {
    const user = await sessionUser();
    if (user && (user.role === "ADMIN" || user.role === "CLIENT")) {
      isUserAuthed = true;
    }
  }

  if (!isCronAuthed && !isUserAuthed) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const leaseDurationMs = 60_000; // 60-second lease
  const leaseExpiresAt = new Date(Date.now() + leaseDurationMs);
  const leaseToken = crypto.randomUUID();

  // Find a pending batch needing staging or committing
  const pendingBatch = await db.importBatch.findFirst({
    where: {
      status: { in: ["STAGING", "COMMITTING"] },
      OR: [
        { workerLeaseExpiresAt: null },
        { workerLeaseExpiresAt: { lt: now } },
      ],
    },
    include: { files: true },
    orderBy: { createdAt: "asc" },
  });

  if (!pendingBatch) {
    return NextResponse.json({ ok: true, idle: true, message: "No batches awaiting processing." });
  }

  // Atomically claim the batch using fence version
  const claimResult = await db.importBatch.updateMany({
    where: {
      id: pendingBatch.id,
      workerFenceVersion: pendingBatch.workerFenceVersion,
    },
    data: {
      workerLeaseToken: leaseToken,
      workerLeaseExpiresAt: leaseExpiresAt,
      workerHeartbeatAt: now,
      workerFenceVersion: { increment: 1 },
      attemptCount: { increment: 1 },
    },
  });

  if (claimResult.count === 0) {
    // Another worker acquired this batch simultaneously
    return NextResponse.json({ ok: true, conflict: true, message: "Batch was leased by another worker." });
  }

  console.log(`[Import Worker] Leased batch ${pendingBatch.id} (${pendingBatch.status}) for client ${pendingBatch.clientId}`);

  try {
    if (pendingBatch.status === "STAGING") {
      const file = pendingBatch.files[0];
      if (!file) throw new Error("No file associated with this staging batch.");

      const spoolPath = getSpoolFilePath(pendingBatch.clientId, pendingBatch.id, file.id);
      const mapping = (file.columnMapping as Record<string, number>) || { phone: 1, name: 0 };

      const stageResult = await stageImportFile(
        pendingBatch.id,
        file.id,
        pendingBatch.clientId,
        spoolPath,
        file.fileFormat,
        0, // header row
        mapping,
        pendingBatch.defaultTags
      );

      await db.importBatch.update({
        where: { id: pendingBatch.id },
        data: {
          status: "STAGED",
          workerLeaseExpiresAt: null,
          workerLeaseToken: null,
        },
      });

      return NextResponse.json({
        ok: true,
        batchId: pendingBatch.id,
        status: "STAGED",
        result: stageResult,
      });
    }

    if (pendingBatch.status === "COMMITTING") {
      const commitResult = await commitImportBatch(pendingBatch.id, pendingBatch.clientId);

      // Clean up spool file after successful commit
      purgeBatchDir(pendingBatch.clientId, pendingBatch.id);

      await db.importBatch.update({
        where: { id: pendingBatch.id },
        data: {
          workerLeaseExpiresAt: null,
          workerLeaseToken: null,
        },
      });

      return NextResponse.json({
        ok: true,
        batchId: pendingBatch.id,
        status: "COMPLETED",
        result: commitResult,
      });
    }

    return NextResponse.json({ ok: true, message: `Batch ${pendingBatch.id} in unhandled state ${pendingBatch.status}` });
  } catch (err: any) {
    console.error(`[Import Worker] Error processing batch ${pendingBatch.id}:`, err);

    await db.importBatch.update({
      where: { id: pendingBatch.id },
      data: {
        status: "FAILED",
        errorMessage: err.message || "Unknown worker processing failure",
        workerLeaseExpiresAt: null,
        workerLeaseToken: null,
      },
    });

    return NextResponse.json({ ok: false, batchId: pendingBatch.id, error: err.message }, { status: 500 });
  }
}

export const GET = handleWorker;
export const POST = handleWorker;
