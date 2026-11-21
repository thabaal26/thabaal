import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { stageImportFile, commitImportBatch } from "@/lib/import-engine";
import { getSpoolFilePath, purgeBatchDir } from "@/lib/import-storage";
import { requireManager } from "@/lib/session";
import { verifySameOrigin, rejectCrossSite } from "@/lib/csrf";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Dedicated Background Worker for Bulk Customer Imports.
 * Safely processes staging and set-based commits in an asynchronous,
 * memory-bounded pipeline without blocking Meta campaigns or webhooks.
 *
 * SEC-P1-01 Hardening:
 * 1. HTTP GET and HEAD are strictly disallowed (HTTP 405 Method Not Allowed).
 * 2. POST execution supports two distinct, verified authorization paths:
 *    a) Machine worker: Timing-safe Bearer CRON_SECRET token authentication.
 *    b) User-triggered worker: Verified Manager session scoped strictly to caller's authenticated clientId.
 * 3. ClientId can NEVER be overridden by request payload or query parameters.
 * 4. Cross-tenant batch access returns 404 with zero information disclosure.
 */

export function GET() {
  return new NextResponse("Method Not Allowed", {
    status: 405,
    headers: { Allow: "POST" },
  });
}

export function HEAD() {
  return new NextResponse(null, {
    status: 405,
    headers: { Allow: "POST" },
  });
}

export async function POST(req: NextRequest) {
  // Authorization Path 1: Machine worker via Bearer CRON_SECRET
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization") ?? "";
  const authBuf = Buffer.from(authHeader);
  const wantBuf = Buffer.from(`Bearer ${secret ?? ""}`);

  const isCronAuthed = !!secret && authBuf.length === wantBuf.length && timingSafeEqual(authBuf, wantBuf);
  let tenantClientId: string | null = null;

  if (!isCronAuthed) {
    // Authorization Path 2: Manager session authentication (requires browser CSRF check)
    const originCheck = verifySameOrigin(req);
    if (!originCheck.ok) return rejectCrossSite(originCheck.reason);

    const scope = await requireManager(true).catch(() => ({ denied: "Unauthorized" } as const));
    if ("denied" in scope || !scope.clientId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    tenantClientId = scope.clientId;
  }

  // Parse optional batchId from JSON body (cannot override tenantClientId)
  let reqBatchId: string | null = null;
  try {
    const body = await req.json();
    if (body && typeof body.batchId === "string" && body.batchId.trim()) {
      reqBatchId = body.batchId.trim();
    }
  } catch {
    // Empty body is valid for queue processing
  }

  const now = new Date();
  const leaseDurationMs = 60_000; // 60-second lease
  const leaseExpiresAt = new Date(Date.now() + leaseDurationMs);
  const leaseToken = crypto.randomUUID();

  // Build query: if user-authenticated, MUST be constrained to tenantClientId
  const whereClause: {
    status: { in: ["STAGING", "COMMITTING"] };
    OR: ({ workerLeaseExpiresAt: null } | { workerLeaseExpiresAt: { lt: Date } })[];
    clientId?: string;
    id?: string;
  } = {
    status: { in: ["STAGING", "COMMITTING"] },
    OR: [
      { workerLeaseExpiresAt: null },
      { workerLeaseExpiresAt: { lt: now } },
    ],
  };

  if (tenantClientId) {
    whereClause.clientId = tenantClientId;
  }

  if (reqBatchId) {
    whereClause.id = reqBatchId;
  }

  // Find a pending batch needing staging or committing
  const pendingBatch = await db.importBatch.findFirst({
    where: whereClause,
    include: { files: true },
    orderBy: { createdAt: "asc" },
  });

  if (!pendingBatch) {
    if (reqBatchId && tenantClientId) {
      // Requested a specific batch that doesn't exist for this tenant -> 404 (zero disclosure)
      return NextResponse.json({ ok: false, error: "Batch not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, idle: true, message: "No batches awaiting processing." });
  }

  // Machine worker safety check: Revalidate that the batch's tenant actually exists
  if (isCronAuthed) {
    const clientExists = await db.client.findUnique({
      where: { id: pendingBatch.clientId },
      select: { id: true },
    });
    if (!clientExists) {
      console.error(`[Import Worker] Orphaned batch ${pendingBatch.id} references non-existent client ${pendingBatch.clientId}`);
      await db.importBatch.updateMany({
        where: { id: pendingBatch.id, clientId: pendingBatch.clientId },
        data: { status: "FAILED", errorMessage: "Invalid tenant association." },
      });
      return NextResponse.json({ ok: false, error: "Invalid tenant association" }, { status: 400 });
    }
  }

  // Atomically claim the batch using fence version and tenant constraint
  const claimResult = await db.importBatch.updateMany({
    where: {
      id: pendingBatch.id,
      clientId: pendingBatch.clientId,
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

      await db.importBatch.updateMany({
        where: { id: pendingBatch.id, clientId: pendingBatch.clientId },
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

      await db.importBatch.updateMany({
        where: { id: pendingBatch.id, clientId: pendingBatch.clientId },
        data: {
          status: "COMPLETED",
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

    await db.importBatch.updateMany({
      where: { id: pendingBatch.id, clientId: pendingBatch.clientId },
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

