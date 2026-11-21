import test from "node:test";
import assert from "node:assert/strict";

function isMissingSentTemplateSnapshotsTable(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: unknown; meta?: { table?: unknown } };
  const table = candidate.meta?.table;
  return (
    candidate.code === "P2021" &&
    (table === "public.sent_template_snapshots" || table === "sent_template_snapshots")
  );
}

test("REPLIES-SNAPSHOT-FALLBACK: Narrow error discriminator tests", async (t) => {
  await t.test("1. Correctly identifies P2021 missing public.sent_template_snapshots table", () => {
    const err = {
      code: "P2021",
      meta: { modelName: "Message", table: "public.sent_template_snapshots" },
    };
    assert.equal(isMissingSentTemplateSnapshotsTable(err), true);
  });

  await t.test("2. Correctly identifies P2021 missing sent_template_snapshots table without public prefix", () => {
    const err = {
      code: "P2021",
      meta: { modelName: "Message", table: "sent_template_snapshots" },
    };
    assert.equal(isMissingSentTemplateSnapshotsTable(err), true);
  });

  await t.test("3. Rejects unrelated P2021 for another table (e.g. Message or Customer)", () => {
    const err1 = {
      code: "P2021",
      meta: { modelName: "Message", table: "public.Message" },
    };
    assert.equal(isMissingSentTemplateSnapshotsTable(err1), false);

    const err2 = {
      code: "P2021",
      meta: { modelName: "Customer", table: "public.Customer" },
    };
    assert.equal(isMissingSentTemplateSnapshotsTable(err2), false);
  });

  await t.test("4. Rejects unrelated Prisma errors (e.g. P2002 Unique constraint, P1001 DB connection)", () => {
    const errP2002 = {
      code: "P2002",
      meta: { target: ["id"] },
    };
    assert.equal(isMissingSentTemplateSnapshotsTable(errP2002), false);

    const errP1001 = {
      code: "P1001",
      message: "Can't reach database server at localhost:5432",
    };
    assert.equal(isMissingSentTemplateSnapshotsTable(errP1001), false);
  });

  await t.test("5. Rejects null, undefined, primitive, or non-object errors", () => {
    assert.equal(isMissingSentTemplateSnapshotsTable(null), false);
    assert.equal(isMissingSentTemplateSnapshotsTable(undefined), false);
    assert.equal(isMissingSentTemplateSnapshotsTable("string error"), false);
    assert.equal(isMissingSentTemplateSnapshotsTable(123), false);
    assert.equal(isMissingSentTemplateSnapshotsTable(new Error("Generic error")), false);
  });
});
