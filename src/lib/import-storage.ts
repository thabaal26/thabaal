import "server-only";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/** Base directory for spooled bulk import files. */
export function getBaseImportsDir(): string {
  if (process.env.IMPORTS_DIR) return process.env.IMPORTS_DIR;
  // If running on production Hostinger VPS:
  if (fs.existsSync("/srv/thabaal/shared")) {
    const vpsPath = "/srv/thabaal/shared/imports";
    if (!fs.existsSync(vpsPath)) fs.mkdirSync(vpsPath, { recursive: true });
    return vpsPath;
  }
  // Local fallback:
  const localPath = path.join(process.cwd(), ".imports");
  if (!fs.existsSync(localPath)) fs.mkdirSync(localPath, { recursive: true });
  return localPath;
}

/** Specific directory for a batch: imports/{clientId}/{batchId} */
export function getBatchDir(clientId: string, batchId: string): string {
  // Sanitize segment names to prevent directory traversal
  const safeClient = clientId.replace(/[^a-zA-Z0-9_-]/g, "");
  const safeBatch = batchId.replace(/[^a-zA-Z0-9_-]/g, "");
  const dir = path.join(getBaseImportsDir(), safeClient, safeBatch);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Full path to an assembled file or binary chunk */
export function getSpoolFilePath(clientId: string, batchId: string, fileId: string): string {
  const safeFile = fileId.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(getBatchDir(clientId, batchId), `${safeFile}.bin`);
}

/** Calculates SHA-256 hash of a file on disk using streaming */
export async function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

/** Per-tenant maximum pending import spool storage (default: 250 MB) */
const MAX_TENANT_SPOOL_BYTES = 250 * 1024 * 1024;

/** Checks if a tenant's pending import files exceed their disk quota */
export function checkTenantSpoolQuota(clientId: string, incomingBytes: number): { ok: boolean; message?: string } {
  try {
    const safeClient = clientId.replace(/[^a-zA-Z0-9_-]/g, "");
    const clientDir = path.join(getBaseImportsDir(), safeClient);
    if (!fs.existsSync(clientDir)) return { ok: true };

    let total = 0;
    const stack = [clientDir];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
        const full = path.join(cur, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (entry.isFile()) total += fs.statSync(full).size;
      }
    }

    if (total + incomingBytes > MAX_TENANT_SPOOL_BYTES) {
      return {
        ok: false,
        message: `Tenant upload storage quota exceeded (${Math.round(total / 1024 / 1024)} MB used of 250 MB limit). Please complete or dismiss pending imports.`,
      };
    }
    return { ok: true };
  } catch (e) {
    console.error("Quota check error:", e);
    return { ok: true };
  }
}

/** Securely purges a batch's spooled files from disk */
export function purgeBatchDir(clientId: string, batchId: string): void {
  try {
    const safeClient = clientId.replace(/[^a-zA-Z0-9_-]/g, "");
    const safeBatch = batchId.replace(/[^a-zA-Z0-9_-]/g, "");
    const dir = path.join(getBaseImportsDir(), safeClient, safeBatch);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (e) {
    console.error(`Failed to purge spool dir for batch ${batchId}:`, e);
  }
}
