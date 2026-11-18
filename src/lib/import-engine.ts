import "server-only";
import fs from "node:fs";
import { parse } from "csv-parse";
import Excel from "exceljs";
import { db } from "./db";
import { normalizePhone, readPhones } from "./phone";
import { getSpoolFilePath } from "./import-storage";

// ==========================================
// BILINGUAL TAMIL & ENGLISH COLUMN MATCHER
// ==========================================

export type TargetField = "phone" | "name" | "location" | "region" | "tags" | "purchases";

const FIELD_PATTERNS: Record<TargetField, RegExp> = {
  phone: /^(phone|mobile|cell|whatsapp|contact|number|ph|mob|தொலைபேசி|கைபேசி|வாட்ஸ்அப்|எண்|செல்\s*எண்)$/i,
  name: /^(name|customer|client|party|buyer|person|full\s*name|பெயர்|வாடிக்கையாளர்\s*பெயர்|நபர்|பார்ட்டி\s*பெயர்)$/i,
  location: /^(area|location|place|town|city|village|street|suburb|address|ஊர்|பகுதி|இடம்|நகரம்|கிராமம்|முகவரி)$/i,
  region: /^(region|zone|district|state|route|division|மாவட்டம்|மண்டலம்|பிரிவு)$/i,
  tags: /^(tag|tags|group|category|segment|type|label|குழு|வகை)$/i,
  purchases: /^(items|products|orders|purchases|goods|oil\s*type|பொருட்கள்|வாங்கியவை|எண்ணெய்\s*வகை)$/i,
};

/** Normalizes header string for dictionary comparison */
export function normalizeHeader(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[_\-./\\()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Scores a column header against standard fields (0.0 to 1.0) */
export function matchHeaderToField(header: string): { field: TargetField | null; score: number } {
  const norm = normalizeHeader(header);
  if (!norm) return { field: null, score: 0 };

  for (const [field, regex] of Object.entries(FIELD_PATTERNS) as [TargetField, RegExp][]) {
    if (regex.test(norm)) return { field, score: 1.0 };
    // Partial substring match
    if (norm.split(" ").some((word) => regex.test(word))) {
      return { field, score: 0.85 };
    }
  }
  return { field: null, score: 0 };
}

/**
 * Sanitizes potential CSV/Excel formula injection (CWE-1236 / DDE Injection).
 * If a string begins with dangerous prefix characters (=, +, -, @, \t, \r),
 * prepend a single quote (') to neutralize execution when opened in Excel/Sheets.
 */
export function sanitizeFormulaInjection(val: string): string {
  if (!val || val.length === 0) return "";
  const raw = String(val);
  const trimmed = raw.trim();
  if (!trimmed) return "";

  const dangerousChars = ["=", "+", "-", "@", "\t", "\r"];
  const startsWithDangerous = dangerousChars.includes(raw[0]) || dangerousChars.includes(trimmed[0]);

  if (startsWithDangerous) {
    // If it's a valid international phone number (e.g. +91 98888 12345 or +123456789), leave as is
    if (/^\+[\d\s\-()]{7,20}$/.test(trimmed)) {
      return trimmed;
    }
    // If it's a valid decimal or integer number (e.g. -15 or -0.5), leave as is
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return trimmed;
    }
    return `'${trimmed}`;
  }
  return trimmed;
}

/** Formats a potentially scientific notation phone number or Excel float, and prevents formula injection */
export function cleanRawCellValue(cell: any): string {
  if (cell === null || cell === undefined) return "";
  let str = "";
  if (typeof cell === "number") {
    // Check if integer or scientific notation
    str = Number.isFinite(cell) ? Math.floor(cell).toFixed(0) : String(cell);
  } else if (typeof cell === "object") {
    // ExcelJS formula or rich text
    if (cell.result !== undefined && cell.result !== null) {
      str = cleanRawCellValue(cell.result);
    } else if (cell.richText && Array.isArray(cell.richText)) {
      str = cell.richText.map((t: any) => t.text || "").join("");
    } else if (cell.text !== undefined) {
      str = String(cell.text);
    } else {
      str = String(cell);
    }
  } else {
    str = String(cell);
  }

  return sanitizeFormulaInjection(str);
}

// ==========================================
// FILE INSPECTION (SHEETS & HEADERS)
// ==========================================

export type DetectedSheet = {
  name: string;
  rowCountEstimate: number;
  headerRowIndex: number; // 0-indexed
  headers: string[];
  suggestedMapping: Record<TargetField, number>; // field -> colIndex
  sampleRows: string[][];
};

export async function inspectFileStructure(filePath: string, format: string): Promise<DetectedSheet[]> {
  const upperFormat = format.toUpperCase();

  if (upperFormat === "CSV" || upperFormat === "TSV" || upperFormat === "TXT") {
    return inspectCsvFile(filePath);
  }
  if (upperFormat === "XLSX" || upperFormat === "XLSM") {
    return inspectXlsxFile(filePath);
  }
  throw new Error(`Unsupported format for inspection: ${format}`);
}

async function inspectCsvFile(filePath: string): Promise<DetectedSheet[]> {
  const sampleLines: string[][] = [];
  const stream = fs.createReadStream(filePath);
  const parser = stream.pipe(
    parse({
      relax_quotes: true,
      relax_column_count: true,
      skip_empty_lines: false,
      to_line: 30, // inspect first 30 lines
    })
  );

  for await (const row of parser) {
    sampleLines.push(row.map((c: any) => cleanRawCellValue(c)));
  }

  const { headerRowIndex, headers } = findBestHeaderRow(sampleLines);
  const suggestedMapping = suggestColumnMapping(headers);

  return [
    {
      name: "Sheet1",
      rowCountEstimate: Math.max(1, sampleLines.length - headerRowIndex - 1),
      headerRowIndex,
      headers,
      suggestedMapping,
      sampleRows: sampleLines.slice(headerRowIndex + 1, headerRowIndex + 11),
    },
  ];
}

async function inspectXlsxFile(filePath: string): Promise<DetectedSheet[]> {
  const workbook = new Excel.Workbook();
  // Using workbook reader for metadata
  await workbook.xlsx.readFile(filePath);
  const results: DetectedSheet[] = [];

  for (const sheet of workbook.worksheets) {
    const rows: string[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber <= 30) {
        const rowVals: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          rowVals[colNumber - 1] = cleanRawCellValue(cell.value);
        });
        rows.push(rowVals);
      }
    });

    const { headerRowIndex, headers } = findBestHeaderRow(rows);
    const suggestedMapping = suggestColumnMapping(headers);

    results.push({
      name: sheet.name,
      rowCountEstimate: Math.max(0, sheet.rowCount - headerRowIndex - 1),
      headerRowIndex,
      headers,
      suggestedMapping,
      sampleRows: rows.slice(headerRowIndex + 1, headerRowIndex + 11),
    });
  }
  return results;
}

/** Heuristic Header Row Hunting across first 25 rows */
function findBestHeaderRow(rows: string[][]): { headerRowIndex: number; headers: string[] } {
  let bestRow = 0;
  let bestScore = -1;

  for (let r = 0; r < Math.min(25, rows.length); r++) {
    const row = rows[r] || [];
    if (!row.length) continue;

    let textCells = 0;
    let matchHits = 0;
    let totalNonEmpty = 0;

    for (const cell of row) {
      const text = cell.trim();
      if (!text) continue;
      totalNonEmpty++;
      if (isNaN(Number(text))) textCells++;
      if (matchHeaderToField(text).score > 0.7) matchHits++;
    }

    if (totalNonEmpty === 0) continue;
    const score = (matchHits / totalNonEmpty) * 0.6 + (textCells / totalNonEmpty) * 0.4;
    if (score > bestScore) {
      bestScore = score;
      bestRow = r;
    }
  }

  const rawHeaders = rows[bestRow] || [];
  const headers = rawHeaders.map((h, i) => (h && h.trim() ? h.trim() : `Column ${i + 1}`));
  return { headerRowIndex: bestRow, headers };
}

function suggestColumnMapping(headers: string[]): Record<TargetField, number> {
  const mapping = {} as Record<TargetField, number>;
  const assigned = new Set<number>();

  for (const field of ["phone", "name", "location", "region", "tags", "purchases"] as TargetField[]) {
    let bestIndex = -1;
    let bestScore = 0;

    headers.forEach((h, idx) => {
      if (assigned.has(idx)) return;
      const { field: matchedField, score } = matchHeaderToField(h);
      if (matchedField === field && score > bestScore) {
        bestScore = score;
        bestIndex = idx;
      }
    });

    if (bestIndex >= 0) {
      mapping[field] = bestIndex;
      assigned.add(bestIndex);
    }
  }
  return mapping;
}

// ==========================================
// STAGING ENGINE (STREAMING & ROW CLASSIFIER)
// ==========================================

export const MAX_IMPORT_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
export const MAX_IMPORT_ROWS = 50_000; // 50,000 rows

export async function stageImportFile(
  batchId: string,
  fileId: string,
  clientId: string,
  filePath: string,
  format: string,
  headerRowIndex: number,
  mapping: Record<string, number>,
  defaultTags: string[] = [],
  selectedSheet?: string | null
): Promise<{ total: number; valid: number; invalid: number; ambiguous: number }> {
  if (fs.existsSync(filePath)) {
    const fileStat = fs.statSync(filePath);
    if (fileStat.size > MAX_IMPORT_FILE_SIZE) {
      throw new Error(`File size (${(fileStat.size / 1024 / 1024).toFixed(1)} MB) exceeds maximum supported limit of 50 MB.`);
    }
  }

  const phoneIdx = mapping.phone ?? -1;
  const nameIdx = mapping.name ?? -1;
  const locationIdx = mapping.location ?? -1;
  const regionIdx = mapping.region ?? -1;
  const tagIdx = mapping.tags ?? -1;
  const purchasesIdx = mapping.purchases ?? -1;

  if (phoneIdx < 0) throw new Error("A phone column mapping is required.");

  let sourceRowNumber = 0;
  let currentSheetName = "Sheet1";
  let stagedCount = 0;
  let validCount = 0;
  let invalidCount = 0;
  let ambiguousCount = 0;

  const seenPhonesInFile = new Set<string>();
  const chunk: any[] = [];
  const CHUNK_SIZE = 1000;

  const flushChunk = async () => {
    if (!chunk.length) return;
    await db.importStagingRecord.createMany({ data: chunk });
    chunk.length = 0;
    // Yield event loop
    await new Promise((r) => setImmediate(r));
  };

  const processRow = async (
    cells: string[],
    activeHeaderRow: number = headerRowIndex,
    pIdx: number = phoneIdx,
    nIdx: number = nameIdx,
    lIdx: number = locationIdx,
    rIdx: number = regionIdx,
    tIdx: number = tagIdx,
    purIdx: number = purchasesIdx
  ) => {
    sourceRowNumber++;
    // Skip header and above
    if (sourceRowNumber <= activeHeaderRow + 1) return;

    const isEmpty = cells.every((c) => !c || !c.trim());
    if (isEmpty) return;

    if (stagedCount >= MAX_IMPORT_ROWS) {
      throw new Error(`Import row count exceeded maximum supported limit of ${MAX_IMPORT_ROWS.toLocaleString()} rows. Please split file into smaller batches.`);
    }

    const rawPhone = (cells[pIdx] ?? "").trim();
    const rawName = (nIdx >= 0 ? cells[nIdx] ?? "" : "").trim();
    const rawLocation = (lIdx >= 0 ? cells[lIdx] ?? "" : "").trim();
    const rawRegion = (rIdx >= 0 ? cells[rIdx] ?? "" : "").trim();
    const rawTags = (tIdx >= 0 ? cells[tIdx] ?? "" : "").trim();
    const rawPurchases = (purIdx >= 0 ? cells[purIdx] ?? "" : "").trim();

    // Parse phone candidates
    const { phones, bad } = readPhones(rawPhone);

    let classification: any = "VALID_SINGLE_NEW";
    let normalizedPhone: string | null = null;
    let candidatePhones: string[] = [];
    const validationErrors: string[] = [];

    if (phones.length === 0) {
      classification = "INVALID_RECORD";
      invalidCount++;
      validationErrors.push(bad.length ? `Unparseable phone value: "${bad.join(", ")}"` : "Missing phone number");
    } else if (phones.length > 1) {
      // PRIMARY_ACTIVE_ONLY policy: Select first phone as primary active recipient, retain candidates for audit
      normalizedPhone = phones[0];
      candidatePhones = phones;
      if (seenPhonesInFile.has(normalizedPhone)) {
        classification = "INTRA_FILE_DUPLICATE";
      } else {
        seenPhonesInFile.add(normalizedPhone);
        classification = "VALID_SINGLE_NEW";
        validCount++;
      }
    } else {
      normalizedPhone = phones[0];
      if (seenPhonesInFile.has(normalizedPhone)) {
        classification = "INTRA_FILE_DUPLICATE";
      } else {
        seenPhonesInFile.add(normalizedPhone);
        validCount++;
      }
    }

    const rowTags = [...new Set([...(rawTags ? rawTags.split(/[,;|]/).map((t) => t.trim()).filter(Boolean) : []), ...defaultTags])];

    chunk.push({
      batchId,
      fileId,
      clientId,
      sourceRowNumber,
      sourceIdentity: `${fileId}:${currentSheetName}:${sourceRowNumber}`,
      rawRowData: { name: rawName, phone: rawPhone, location: rawLocation, tags: rawTags, purchases: rawPurchases },
      normalizedData: { name: rawName || "Customer", phone: normalizedPhone, location: rawLocation || null },
      normalizedPhone,
      candidatePhones,
      name: rawName || "Customer",
      location: rawLocation || null,
      region: rawRegion || null,
      tags: rowTags,
      classification,
      validationErrors,
      reviewStatus: classification === "AMBIGUOUS_MULTI_PHONE" ? "PENDING" : "APPROVED",
    });

    stagedCount++;
    if (chunk.length >= CHUNK_SIZE) {
      await flushChunk();
    }
  };

  // Stream according to format
  const upperFormat = format.toUpperCase();
  if (upperFormat === "CSV" || upperFormat === "TSV" || upperFormat === "TXT") {
    currentSheetName = "Sheet1";
    const stream = fs.createReadStream(filePath);
    const parser = stream.pipe(parse({ relax_quotes: true, relax_column_count: true, skip_empty_lines: true }));
    for await (const row of parser) {
      await processRow(row.map((c: any) => cleanRawCellValue(c)));
    }
  } else {
    const workbook = new Excel.Workbook();
    await workbook.xlsx.readFile(filePath);

    let targetSheets: Excel.Worksheet[] = [];
    if (selectedSheet === "ALL" || selectedSheet === "*") {
      targetSheets = workbook.worksheets;
    } else if (selectedSheet && selectedSheet.trim()) {
      const match = workbook.getWorksheet(selectedSheet.trim());
      if (!match) {
        const available = workbook.worksheets.map((w) => `"${w.name}"`).join(", ");
        throw new Error(`Worksheet "${selectedSheet}" not found in workbook. Available worksheets: ${available}`);
      }
      targetSheets = [match];
    } else {
      targetSheets = workbook.worksheets.length > 0 ? [workbook.worksheets[0]] : [];
    }

    for (const sheet of targetSheets) {
      if (!sheet) continue;
      currentSheetName = sheet.name;
      sourceRowNumber = 0; // Header offset applies per sheet

      // Multi-sheet per-sheet layout validation & independent mapping resolution (Section 5.2)
      let activePhoneIdx = phoneIdx;
      let activeNameIdx = nameIdx;
      let activeLocationIdx = locationIdx;
      let activeRegionIdx = regionIdx;
      let activeTagIdx = tagIdx;
      let activePurchasesIdx = purchasesIdx;
      let activeHeaderRowIndex = headerRowIndex;

      if (targetSheets.length > 1) {
        // Collect first 25 rows to inspect this specific sheet's headers
        const sampleRows: string[][] = [];
        sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          if (rowNumber <= 25) {
            const rowVals: string[] = [];
            row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
              rowVals[colNumber - 1] = cleanRawCellValue(cell.value);
            });
            sampleRows.push(rowVals);
          }
        });

        const { headerRowIndex: sheetHeaderRow, headers: sheetHeaders } = findBestHeaderRow(sampleRows);
        const mappedHeader = sheetHeaders[phoneIdx] || "";
        const isBaseMappingCompatible = matchHeaderToField(mappedHeader).field === "phone";

        if (!isBaseMappingCompatible) {
          // Layout differs from the primary sheet: auto-detect column mapping specifically for this worksheet
          const sheetAutoMapping = suggestColumnMapping(sheetHeaders);
          if (sheetAutoMapping.phone !== undefined && sheetAutoMapping.phone >= 0) {
            activePhoneIdx = sheetAutoMapping.phone;
            activeNameIdx = sheetAutoMapping.name ?? -1;
            activeLocationIdx = sheetAutoMapping.location ?? -1;
            activeRegionIdx = sheetAutoMapping.region ?? -1;
            activeTagIdx = sheetAutoMapping.tags ?? -1;
            activePurchasesIdx = sheetAutoMapping.purchases ?? -1;
            activeHeaderRowIndex = sheetHeaderRow;
          } else {
            throw new Error(`Worksheet "${sheet.name}" has an incompatible column layout with no valid phone column detected. Please import "${sheet.name}" individually with its own column mapping.`);
          }
        }
      }

      for (let r = 1; r <= sheet.rowCount; r++) {
        const row = sheet.getRow(r);
        const cells: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          cells[colNumber - 1] = cleanRawCellValue(cell.value);
        });
        await processRow(
          cells,
          activeHeaderRowIndex,
          activePhoneIdx,
          activeNameIdx,
          activeLocationIdx,
          activeRegionIdx,
          activeTagIdx,
          activePurchasesIdx
        );
      }
    }
  }

  await flushChunk();

  // Reconcile with existing database records for this tenant
  await db.$executeRaw`
    UPDATE "ImportStagingRecord" s
    SET "classification" = 'VALID_SINGLE_EXISTING'
    FROM "Customer" c
    WHERE s."batchId" = ${batchId}
      AND s."clientId" = ${clientId}
      AND s."classification" = 'VALID_SINGLE_NEW'
      AND s."normalizedPhone" IS NOT NULL
      AND c."clientId" = ${clientId}
      AND c."phone" = s."normalizedPhone"
  `;

  // Update batch metrics
  const existCount = await db.importStagingRecord.count({
    where: { batchId, classification: "VALID_SINGLE_EXISTING" },
  });

  await db.importBatch.update({
    where: { id: batchId },
    data: {
      totalSourceRows: sourceRowNumber,
      validSingleNew: validCount - existCount,
      validSingleExist: existCount,
      invalidRows: invalidCount,
      ambiguousRows: ambiguousCount,
      status: "STAGED",
    },
  });

  return { total: stagedCount, valid: validCount, invalid: invalidCount, ambiguous: ambiguousCount };
}

// ==========================================
// SET-BASED SQL INGESTION COMMITTER
// ==========================================

export async function commitImportBatch(batchId: string, clientId: string): Promise<{ committedNew: number; committedUpdated: number }> {
  const batch = await db.importBatch.findFirst({
    where: { id: batchId, clientId },
  });
  if (!batch) throw new Error("Batch not found or unauthorized");

  await db.importBatch.update({
    where: { id: batchId },
    data: { status: "COMMITTING" },
  });

  // Step 1: Bulk Insert Fresh Customers
  const insertResult = await db.$executeRaw`
    INSERT INTO "Customer" (
      "id", "clientId", "name", "phone", "location", "region", "tags", "optInSource", "optInAt", "createdAt", "updatedAt"
    )
    SELECT 
      gen_random_uuid(),
      s."clientId",
      COALESCE(NULLIF(s."name", ''), 'Customer'),
      s."normalizedPhone",
      s."location",
      s."region",
      s."tags",
      b."optInSource",
      NOW(),
      NOW(),
      NOW()
    FROM "ImportStagingRecord" s
    JOIN "ImportBatch" b ON b."id" = s."batchId"
    WHERE s."batchId" = ${batchId}
      AND s."clientId" = ${clientId}
      AND s."classification" = 'VALID_SINGLE_NEW'
      AND s."normalizedPhone" IS NOT NULL
    ON CONFLICT ("clientId", "phone") DO NOTHING
  `;

  // Step 2: Set-Based Update for Existing Customers (Safe Tag Union, IMMUTABLE opt-out / consent)
  const updateResult = await db.$executeRaw`
    UPDATE "Customer" c
    SET 
      "tags" = ARRAY(SELECT DISTINCT unnest(c."tags" || s."tags")),
      "location" = CASE 
        WHEN ${batch.overwriteAreas} THEN COALESCE(s."location", c."location")
        ELSE COALESCE(c."location", s."location")
      END,
      "name" = CASE
        WHEN ${batch.overwriteNames} AND s."name" IS NOT NULL AND s."name" != '' AND s."name" != 'Customer' THEN s."name"
        WHEN c."name" = 'Customer' OR c."name" IS NULL OR c."name" = '' THEN COALESCE(s."name", c."name")
        ELSE c."name"
      END,
      "updatedAt" = NOW()
    FROM "ImportStagingRecord" s
    WHERE s."batchId" = ${batchId}
      AND s."clientId" = ${clientId}
      AND s."classification" = 'VALID_SINGLE_EXISTING'
      AND s."normalizedPhone" IS NOT NULL
      AND c."clientId" = ${clientId}
      AND c."phone" = s."normalizedPhone"
  `;

  const committedNew = Number(insertResult);
  const committedUpdated = Number(updateResult);

  await db.importBatch.update({
    where: { id: batchId },
    data: {
      status: "COMPLETED",
      committedNew,
      committedUpdated,
      completedAt: new Date(),
    },
  });

  return { committedNew, committedUpdated };
}
