/**
 * Thabaal — Legacy Null-Tenant Media Reconciliation & Review Utility (F-05)
 * Analyzes unassigned images and template references without printing customer secrets or private data.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  console.log("=== THABAAL LEGACY MEDIA RECONCILIATION AUDIT ===");

  const totalImages = await db.portalUploadedImage.count();
  const nullClientImages = await db.portalUploadedImage.count({ where: { clientId: null } });
  const assignedImages = await db.portalUploadedImage.count({ where: { clientId: { not: null } } });
  const publicImages = await db.portalUploadedImage.count({ where: { isPublic: true } });
  const privateImages = await db.portalUploadedImage.count({ where: { isPublic: false } });

  console.log(`Total Uploaded Images: ${totalImages}`);
  console.log(`- Tenant Assigned: ${assignedImages}`);
  console.log(`- Unassigned (clientId IS NULL): ${nullClientImages}`);
  console.log(`- Marked Public: ${publicImages}`);
  console.log(`- Marked Private: ${privateImages}`);

  // Inspect template references
  const imageTemplates = await db.template.findMany({
    where: { headerType: "IMAGE", headerMediaUrl: { not: null } },
    select: { id: true, clientId: true, name: true, status: true, headerMediaUrl: true },
  });

  const refMap = new Map<string, { clients: Set<string>; statuses: Set<string> }>();

  for (const t of imageTemplates) {
    if (!t.headerMediaUrl) continue;
    const match = t.headerMediaUrl.match(/\/api\/upload\/([a-zA-Z0-9._-]+)/);
    if (!match) continue;
    const imgId = match[1];

    if (!refMap.has(imgId)) {
      refMap.set(imgId, { clients: new Set(), statuses: new Set() });
    }
    const entry = refMap.get(imgId)!;
    entry.clients.add(t.clientId);
    entry.statuses.add(t.status);
  }

  let singleClientApproved = 0;
  let multiClientShared = 0;
  let draftOnly = 0;
  let rejectedOnly = 0;

  for (const [, entry] of refMap) {
    if (entry.clients.size > 1) {
      multiClientShared++;
    } else {
      if (entry.statuses.has("APPROVED")) singleClientApproved++;
      else if (entry.statuses.has("DRAFT")) draftOnly++;
      else if (entry.statuses.has("REJECTED")) rejectedOnly++;
    }
  }

  console.log("\n=== TEMPLATE MEDIA USAGE CLASSIFICATION ===");
  console.log(`Images with Single-Tenant Approved Template: ${singleClientApproved}`);
  console.log(`Images Shared Across Multiple Tenants: ${multiClientShared}`);
  console.log(`Images with Draft Templates Only: ${draftOnly}`);
  console.log(`Images with Rejected Templates Only: ${rejectedOnly}`);
  console.log(`Images with Zero Template References: ${totalImages - refMap.size}`);
  console.log("\nAudit complete. No private customer information was exposed.");
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
