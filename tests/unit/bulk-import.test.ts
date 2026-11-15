// Tests the Universal Bulk Customer Import Engine
// Verifies format normalization, bilingual Tamil/English header matching, tenant isolation, and conflict safety.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { after, before, describe, test } from "node:test";
import Excel from "exceljs";
import { db } from "../../src/lib/db";
import { matchHeaderToField, cleanRawCellValue, commitImportBatch, stageImportFile } from "../../src/lib/import-engine";

let tenantA: { id: string };
let tenantB: { id: string };

before(async () => {
  await db.importBatch.deleteMany({}).catch(() => {});
  await db.customer.deleteMany({ where: { client: { name: { in: ["Import Test Client A", "Import Test Client B"] } } } }).catch(() => {});
  await db.client.deleteMany({ where: { name: { in: ["Import Test Client A", "Import Test Client B"] } } }).catch(() => {});

  tenantA = await db.client.create({ data: { name: "Import Test Client A", homeCity: "Madurai" } });
  tenantB = await db.client.create({ data: { name: "Import Test Client B", homeCity: "Coimbatore" } });
});

after(async () => {
  await db.importBatch.deleteMany({}).catch(() => {});
  await db.customer.deleteMany({ where: { client: { name: { in: ["Import Test Client A", "Import Test Client B"] } } } }).catch(() => {});
  await db.client.deleteMany({ where: { name: { in: ["Import Test Client A", "Import Test Client B"] } } }).catch(() => {});
});

describe("Universal Bulk Import: Header & Value Normalization", () => {
  test("matches English column headers accurately", () => {
    assert.equal(matchHeaderToField("Phone Number").field, "phone");
    assert.equal(matchHeaderToField("mobile").field, "phone");
    assert.equal(matchHeaderToField("Customer Name").field, "name");
    assert.equal(matchHeaderToField("Location").field, "location");
    assert.equal(matchHeaderToField("Area").field, "location");
    assert.equal(matchHeaderToField("Tags").field, "tags");
  });

  test("matches Tamil Unicode column headers accurately", () => {
    assert.equal(matchHeaderToField("தொலைபேசி").field, "phone");
    assert.equal(matchHeaderToField("கைபேசி").field, "phone");
    assert.equal(matchHeaderToField("பெயர்").field, "name");
    assert.equal(matchHeaderToField("ஊர்").field, "location");
    assert.equal(matchHeaderToField("பகுதி").field, "location");
    assert.equal(matchHeaderToField("குழு").field, "tags");
  });

  test("unrecognized columns return field: null", () => {
    assert.equal(matchHeaderToField("Random Col 123").field, null);
    assert.equal(matchHeaderToField("GSTIN").field, null);
  });

  test("cleans scientific notation numbers and formula objects", () => {
    // Scientific notation float: 9.87654E+11 -> "987654000000"
    assert.equal(cleanRawCellValue(987654000000), "987654000000");
    // Formula result object
    assert.equal(cleanRawCellValue({ result: "919876543210" }), "919876543210");
    // Rich text object
    assert.equal(cleanRawCellValue({ richText: [{ text: "Sundar " }, { text: "Rajan" }] }), "Sundar Rajan");
  });

  test("XLS-03: Formula injection defense neutralizes dangerous formula prefixes", () => {
    // Dangerous DDE / formula injection attempts must be prepended with a single quote (')
    assert.equal(cleanRawCellValue("=cmd|' /C calc'!A0"), "'=cmd|' /C calc'!A0");
    assert.equal(cleanRawCellValue("@SUM(A1:A10)"), "'@SUM(A1:A10)");
    assert.equal(cleanRawCellValue("-2+3+cmd|' /C calc'!A0"), "'-2+3+cmd|' /C calc'!A0");
    assert.equal(cleanRawCellValue("+payload"), "'+payload");
    assert.equal(cleanRawCellValue("\tmalicious_tab"), "'malicious_tab");

    // Legitimate numbers and international phone numbers must NOT be broken
    assert.equal(cleanRawCellValue("+919876543210"), "+919876543210");
    assert.equal(cleanRawCellValue("+91 98888 12345"), "+91 98888 12345");
    assert.equal(cleanRawCellValue("-15"), "-15");
    assert.equal(cleanRawCellValue("-0.75"), "-0.75");
    assert.equal(cleanRawCellValue("Normal Customer Name"), "Normal Customer Name");
  });
});

describe("Universal Bulk Import: Tenant Isolation & Field Conflict Safety", () => {
  test("commit preserves existing customer opt-out status (IMMUTABLE)", async () => {
    // 1. Create an existing customer for Tenant A who has OPTED OUT
    const existing = await db.customer.create({
      data: {
        clientId: tenantA.id,
        phone: "919876543210",
        name: "Existing Opted Out Customer",
        optedOut: true,
        optInSource: "Store POS Bill",
        optInAt: new Date("2026-01-01"),
        tags: ["vip", "regular"],
      },
    });

    // 2. Create an ImportBatch and an ImportStagingRecord for Tenant A with the same phone
    const batch = await db.importBatch.create({
      data: {
        clientId: tenantA.id,
        userId: "test-user",
        idempotencyKey: `batch_test_${Date.now()}`,
        optInSource: "Old 2024 Spreadsheet",
        status: "STAGED",
        files: {
          create: {
            clientId: tenantA.id,
            originalFileName: "old_contacts.csv",
            safeStoredFileName: "old_contacts.csv",
            fileFormat: "CSV",
            fileSize: 1024,
            checksum: "abc",
            storagePath: "/tmp/old_contacts.csv",
            status: "UPLOADED",
          },
        },
      },
      include: { files: true },
    });

    await db.importStagingRecord.create({
      data: {
        batchId: batch.id,
        fileId: batch.files[0].id,
        clientId: tenantA.id,
        sourceRowNumber: 2,
        sourceIdentity: `${batch.files[0].id}:Sheet1:2`,
        normalizedPhone: "919876543210",
        name: "New Name From Excel",
        tags: ["diwali-offer"],
        classification: "VALID_SINGLE_EXISTING",
      },
    });

    // 3. Commit the batch
    const res = await commitImportBatch(batch.id, tenantA.id);
    assert.equal(res.committedUpdated, 1);

    // 4. Verify existing customer was updated safely
    const updated = await db.customer.findUniqueOrThrow({
      where: { id: existing.id },
    });

    // CRITICAL: optedOut must STILL be true!
    assert.equal(updated.optedOut, true, "optedOut must remain true!");
    // CRITICAL: original optInSource must NOT be overwritten!
    assert.equal(updated.optInSource, "Store POS Bill", "Original optInSource must be preserved!");
    // Tags must be merged as a set union
    assert.deepEqual(updated.tags.sort(), ["diwali-offer", "regular", "vip"].sort(), "Tags must be merged via union!");
  });

  test("tenant B cannot commit tenant A's import batch", async () => {
    const batchA = await db.importBatch.create({
      data: {
        clientId: tenantA.id,
        userId: "user-a",
        idempotencyKey: `batch_isolation_${Date.now()}`,
        optInSource: "Direct Form",
        status: "STAGED",
      },
    });

    // Tenant B attempts to commit Tenant A's batch
    await assert.rejects(
      async () => {
        await commitImportBatch(batchA.id, tenantB.id);
      },
      /Batch not found or unauthorized/,
      "Cross-tenant commit must be rejected!"
    );
  });

  test("XLS-02: Multi-sheet XLSX parsing in stageImportFile supports targeted sheet selection", async () => {
    // Create a temporary multi-sheet XLSX file
    const tmpXlsxPath = path.join(os.tmpdir(), `test_multisheet_${Date.now()}.xlsx`);
    const workbook = new Excel.Workbook();

    // Sheet 1: Retail contacts
    const sheet1 = workbook.addWorksheet("Retail");
    sheet1.addRow(["Customer Name", "Phone Number", "Location"]);
    sheet1.addRow(["Retail Alice", "+919876500001", "Madurai"]);
    sheet1.addRow(["Retail Bob", "+919876500002", "Madurai"]);

    // Sheet 2: Wholesale contacts
    const sheet2 = workbook.addWorksheet("Wholesale");
    sheet2.addRow(["Customer Name", "Phone Number", "Location"]);
    sheet2.addRow(["Wholesale Charlie", "+919876500003", "Chennai"]);
    sheet2.addRow(["Wholesale Diana", "+919876500004", "Coimbatore"]);

    await workbook.xlsx.writeFile(tmpXlsxPath);

    // Create batch for Wholesale sheet staging
    const batch = await db.importBatch.create({
      data: {
        clientId: tenantA.id,
        userId: "test-user-ms",
        idempotencyKey: `batch_ms_${Date.now()}`,
        optInSource: "Wholesale List",
        status: "STAGED",
        files: {
          create: {
            clientId: tenantA.id,
            originalFileName: "multi_contacts.xlsx",
            safeStoredFileName: "multi_contacts.xlsx",
            fileFormat: "XLSX",
            fileSize: 2048,
            checksum: "ms_abc",
            storagePath: tmpXlsxPath,
            status: "UPLOADED",
          },
        },
      },
      include: { files: true },
    });

    try {
      const mapping = { name: 0, phone: 1, location: 2 };
      // Stage ONLY Sheet "Wholesale"
      const res = await stageImportFile(
        batch.id,
        batch.files[0].id,
        tenantA.id,
        tmpXlsxPath,
        "XLSX",
        0, // header at row 0
        mapping,
        ["wholesale-tag"],
        "Wholesale"
      );

      assert.equal(res.valid, 2, "Must stage exactly 2 records from Wholesale sheet");

      // Verify records in database
      const stagedRecords = await db.importStagingRecord.findMany({
        where: { batchId: batch.id },
      });
      assert.equal(stagedRecords.length, 2);
      assert.ok(stagedRecords.some((r) => r.name === "Wholesale Charlie"));
      assert.ok(stagedRecords.some((r) => r.name === "Wholesale Diana"));
      assert.ok(!stagedRecords.some((r) => r.name === "Retail Alice"), "Retail sheet rows must NOT be staged when Wholesale is selected!");

      // Verify row provenance contains the exact worksheet name "Wholesale"
      for (const rec of stagedRecords) {
        assert.ok(rec.sourceIdentity.includes(":Wholesale:"), `sourceIdentity "${rec.sourceIdentity}" must record exact sheet name "Wholesale"`);
      }
    } finally {
      if (fs.existsSync(tmpXlsxPath)) fs.unlinkSync(tmpXlsxPath);
      await db.importStagingRecord.deleteMany({ where: { batchId: batch.id } }).catch(() => {});
      await db.importBatch.deleteMany({ where: { id: batch.id } }).catch(() => {});
    }
  });

  test("XLS-02b: Requesting a non-existent worksheet name throws validation error without falling back", async () => {
    const tmpXlsxPath = path.join(os.tmpdir(), `test_nonexistent_sheet_${Date.now()}.xlsx`);
    const workbook = new Excel.Workbook();
    const sheet1 = workbook.addWorksheet("AvailableSheet");
    sheet1.addRow(["Customer Name", "Phone Number"]);
    sheet1.addRow(["Test Alice", "+919876500099"]);
    await workbook.xlsx.writeFile(tmpXlsxPath);

    const batch = await db.importBatch.create({
      data: {
        clientId: tenantA.id,
        userId: "test-user-err",
        idempotencyKey: `batch_err_${Date.now()}`,
        optInSource: "Error Test",
        status: "STAGED",
        files: {
          create: {
            clientId: tenantA.id,
            originalFileName: "test.xlsx",
            safeStoredFileName: "test.xlsx",
            fileFormat: "XLSX",
            fileSize: 1024,
            checksum: "err_abc",
            storagePath: tmpXlsxPath,
            status: "UPLOADED",
          },
        },
      },
      include: { files: true },
    });

    try {
      const mapping = { name: 0, phone: 1 };
      await assert.rejects(
        async () => {
          await stageImportFile(
            batch.id,
            batch.files[0].id,
            tenantA.id,
            tmpXlsxPath,
            "XLSX",
            0,
            mapping,
            [],
            "NonExistentSheet"
          );
        },
        /Worksheet "NonExistentSheet" not found in workbook/,
        "Must throw explicit worksheet not found error instead of silently falling back to Sheet 1"
      );

      // Verify zero records were staged
      const stagedCount = await db.importStagingRecord.count({ where: { batchId: batch.id } });
      assert.equal(stagedCount, 0, "Zero records should be staged on worksheet error");
    } finally {
      if (fs.existsSync(tmpXlsxPath)) fs.unlinkSync(tmpXlsxPath);
      await db.importStagingRecord.deleteMany({ where: { batchId: batch.id } }).catch(() => {});
      await db.importBatch.deleteMany({ where: { id: batch.id } }).catch(() => {});
    }
  });

  test("XLS-02c: Multi-sheet ALL stages records across all worksheets with per-sheet provenance", async () => {
    const tmpXlsxPath = path.join(os.tmpdir(), `test_all_sheets_${Date.now()}.xlsx`);
    const workbook = new Excel.Workbook();

    const sheet1 = workbook.addWorksheet("North");
    sheet1.addRow(["Customer Name", "Phone Number"]);
    sheet1.addRow(["North Person", "+919876500111"]);

    const sheet2 = workbook.addWorksheet("South");
    sheet2.addRow(["Customer Name", "Phone Number"]);
    sheet2.addRow(["South Person", "+919876500222"]);

    await workbook.xlsx.writeFile(tmpXlsxPath);

    const batch = await db.importBatch.create({
      data: {
        clientId: tenantA.id,
        userId: "test-user-all",
        idempotencyKey: `batch_all_${Date.now()}`,
        optInSource: "All Test",
        status: "STAGED",
        files: {
          create: {
            clientId: tenantA.id,
            originalFileName: "all_sheets.xlsx",
            safeStoredFileName: "all_sheets.xlsx",
            fileFormat: "XLSX",
            fileSize: 2048,
            checksum: "all_abc",
            storagePath: tmpXlsxPath,
            status: "UPLOADED",
          },
        },
      },
      include: { files: true },
    });

    try {
      const mapping = { name: 0, phone: 1 };
      const res = await stageImportFile(
        batch.id,
        batch.files[0].id,
        tenantA.id,
        tmpXlsxPath,
        "XLSX",
        0,
        mapping,
        [],
        "ALL"
      );

      assert.equal(res.valid, 2, "Must stage both North and South sheets");
      const records = await db.importStagingRecord.findMany({ where: { batchId: batch.id } });
      assert.equal(records.length, 2);

      const northRec = records.find((r) => r.name === "North Person");
      const southRec = records.find((r) => r.name === "South Person");
      assert.ok(northRec && northRec.sourceIdentity.includes(":North:"), "North record must record :North: in sourceIdentity");
      assert.ok(southRec && southRec.sourceIdentity.includes(":South:"), "South record must record :South: in sourceIdentity");
    } finally {
      if (fs.existsSync(tmpXlsxPath)) fs.unlinkSync(tmpXlsxPath);
      await db.importStagingRecord.deleteMany({ where: { batchId: batch.id } }).catch(() => {});
      await db.importBatch.deleteMany({ where: { id: batch.id } }).catch(() => {});
    }
  });

  test("XLS-02d: Multi-sheet handles differing column layouts across sheets via per-sheet layout resolution", async () => {
    const tmpXlsxPath = path.join(os.tmpdir(), `test_diff_layouts_${Date.now()}.xlsx`);
    const workbook = new Excel.Workbook();

    // Sheet 1: Retail (Name: col 0, Phone: col 1)
    const sheet1 = workbook.addWorksheet("Retail");
    sheet1.addRow(["Customer Name", "Phone Number"]);
    sheet1.addRow(["Retail Person", "+919876500333"]);

    // Sheet 2: Wholesale (Phone: col 0, Name: col 1) - differing layout!
    const sheet2 = workbook.addWorksheet("Wholesale");
    sheet2.addRow(["Phone Number", "Customer Name"]);
    sheet2.addRow(["+919876500444", "Wholesale Person"]);

    await workbook.xlsx.writeFile(tmpXlsxPath);

    const batch = await db.importBatch.create({
      data: {
        clientId: tenantA.id,
        userId: "test-user-diff",
        idempotencyKey: `batch_diff_${Date.now()}`,
        optInSource: "Diff Test",
        status: "STAGED",
        files: {
          create: {
            clientId: tenantA.id,
            originalFileName: "diff_layouts.xlsx",
            safeStoredFileName: "diff_layouts.xlsx",
            fileFormat: "XLSX",
            fileSize: 2048,
            checksum: "diff_abc",
            storagePath: tmpXlsxPath,
            status: "UPLOADED",
          },
        },
      },
      include: { files: true },
    });

    try {
      const mapping = { name: 0, phone: 1 };
      const res = await stageImportFile(
        batch.id,
        batch.files[0].id,
        tenantA.id,
        tmpXlsxPath,
        "XLSX",
        0,
        mapping,
        [],
        "ALL"
      );

      assert.equal(res.valid, 2, "Must successfully stage both sheets despite differing column layouts");
      const records = await db.importStagingRecord.findMany({ where: { batchId: batch.id } });
      assert.equal(records.length, 2);

      const retailRec = records.find((r) => r.name === "Retail Person");
      const wholesaleRec = records.find((r) => r.name === "Wholesale Person");

      assert.ok(retailRec, "Retail person must be staged");
      assert.equal(retailRec.normalizedPhone, "919876500333");

      assert.ok(wholesaleRec, "Wholesale person must be staged with phone from column 0");
      assert.equal(wholesaleRec.normalizedPhone, "919876500444");
    } finally {
      if (fs.existsSync(tmpXlsxPath)) fs.unlinkSync(tmpXlsxPath);
      await db.importStagingRecord.deleteMany({ where: { batchId: batch.id } }).catch(() => {});
      await db.importBatch.deleteMany({ where: { id: batch.id } }).catch(() => {});
    }
  });

  test("XLS-02e: Multi-sheet strictly rejects incompatible worksheets missing phone column", async () => {
    const tmpXlsxPath = path.join(os.tmpdir(), `test_incompatible_${Date.now()}.xlsx`);
    const workbook = new Excel.Workbook();

    // Sheet 1: Customers (valid)
    const sheet1 = workbook.addWorksheet("Customers");
    sheet1.addRow(["Customer Name", "Phone Number"]);
    sheet1.addRow(["Valid Person", "+919876500555"]);

    // Sheet 2: Inventory (incompatible - no phone column!)
    const sheet2 = workbook.addWorksheet("Inventory");
    sheet2.addRow(["Item Name", "Quantity", "Price"]);
    sheet2.addRow(["Cold Pressed Oil", "50", "300"]);

    await workbook.xlsx.writeFile(tmpXlsxPath);

    const batch = await db.importBatch.create({
      data: {
        clientId: tenantA.id,
        userId: "test-user-incompat",
        idempotencyKey: `batch_incompat_${Date.now()}`,
        optInSource: "Incompatible Test",
        status: "STAGED",
        files: {
          create: {
            clientId: tenantA.id,
            originalFileName: "incompatible.xlsx",
            safeStoredFileName: "incompatible.xlsx",
            fileFormat: "XLSX",
            fileSize: 2048,
            checksum: "incompat_abc",
            storagePath: tmpXlsxPath,
            status: "UPLOADED",
          },
        },
      },
      include: { files: true },
    });

    try {
      const mapping = { name: 0, phone: 1 };
      await assert.rejects(
        async () => {
          await stageImportFile(
            batch.id,
            batch.files[0].id,
            tenantA.id,
            tmpXlsxPath,
            "XLSX",
            0,
            mapping,
            [],
            "ALL"
          );
        },
        /Worksheet "Inventory" has an incompatible column layout with no valid phone column detected/,
        "Must reject incompatible worksheet without staging invalid data"
      );
    } finally {
      if (fs.existsSync(tmpXlsxPath)) fs.unlinkSync(tmpXlsxPath);
      await db.importStagingRecord.deleteMany({ where: { batchId: batch.id } }).catch(() => {});
      await db.importBatch.deleteMany({ where: { id: batch.id } }).catch(() => {});
    }
  });
});
