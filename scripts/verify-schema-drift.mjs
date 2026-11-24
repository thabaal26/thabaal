#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Automated Production Deployment Schema Drift Gate (Turn 40-44 Full Coverage)
 *
 * Compares live database schema against current release's prisma/schema.prisma.
 * Fails closed if ANY required table, column, unique index, regular index,
 * foreign key constraint, enum type, enum value, or nullability constraint is missing.
 *
 * Security: Uses execFileSync with explicit argument array to eliminate shell interpolation.
 *
 * Explicit Legacy Allowlist:
 * Tolerates known unmanaged legacy objects (PortalMetaAlert, PortalMetaConnect, PortalMetaSignup)
 * and cosmetic Prisma client runtime defaults (e.g. updatedAt DROP DEFAULT, timestamp precision).
 */

const schemaPath = path.resolve(process.env.PRISMA_SCHEMA || "prisma/schema.prisma");
if (!fs.existsSync(schemaPath)) {
  console.error(`[Schema Drift Gate] FATAL: Schema file not found at ${schemaPath}`);
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!dbUrl || !dbUrl.trim()) {
  console.error("[Schema Drift Gate] FATAL: DATABASE_URL_UNPOOLED or DATABASE_URL must be set");
  process.exit(1);
}

console.log("[Schema Drift Gate] Running comprehensive schema diff check against database...");

// Prefer local node_modules/.bin/prisma if available, otherwise check build repo, otherwise fallback to npx with pinned version
const candidatePrismaPaths = [
  path.resolve(process.platform === "win32" ? "node_modules/.bin/prisma.cmd" : "node_modules/.bin/prisma"),
  "/srv/thabaal/build/repo/node_modules/.bin/prisma",
];
const prismaBinary = candidatePrismaPaths.find((p) => fs.existsSync(p));
const useLocalPrisma = Boolean(prismaBinary);

let diffOutput = "";
try {
  if (useLocalPrisma && prismaBinary) {
    diffOutput = execFileSync(
      prismaBinary,
      ["migrate", "diff", "--from-url", dbUrl, "--to-schema-datamodel", schemaPath, "--script"],
      {
        encoding: "utf8",
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024,
        env: process.env,
        shell: process.platform === "win32",
      }
    );
  } else {
    diffOutput = execFileSync(
      "npx",
      ["--yes", "prisma@6.19.3", "migrate", "diff", "--from-url", dbUrl, "--to-schema-datamodel", schemaPath, "--script"],
      {
        encoding: "utf8",
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024,
        env: process.env,
        shell: process.platform === "win32",
      }
    );
  }
} catch (err) {
  console.error("[Schema Drift Gate] FATAL: Failed to execute prisma migrate diff:", err.message || err);
  process.exit(1);
}

// 1. Strip all SQL line comments (-- ...) so comment headers like -- CreateTable don't mask statements
const cleanedSql = diffOutput.replace(/^--.*$/gm, "").trim();

// 2. Split diffOutput into SQL statements separated by semicolons
const statements = cleanedSql
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

const violations = [];

// Approved unmanaged legacy tables that must never block deployment when Prisma proposes to DROP them
const LEGACY_UNMANAGED_TABLES = new Set(["PortalMetaAlert", "PortalMetaConnect", "PortalMetaSignup"]);
const LEGACY_UNMANAGED_INDEXES = new Set(["Order_paymentUtr_idx", "WhatsAppNumber_connectionId_idx"]);

for (const rawStmt of statements) {
  // Normalize internal whitespace
  const stmt = rawStmt.replace(/\s+/g, " ");

  // 1. Missing Table: CREATE TABLE ...
  const createTableMatch = stmt.match(/^CREATE\s+TABLE\s+(?:public\.)?"?([a-zA-Z0-9_]+)"?/i);
  if (createTableMatch) {
    violations.push({ type: "MISSING_TABLE", object: createTableMatch[1], sql: stmt });
    continue;
  }

  // 2. Missing Unique Index: CREATE UNIQUE INDEX ...
  const createUniqueIdxMatch = stmt.match(/^CREATE\s+UNIQUE\s+INDEX\s+(?:public\.)?"?([a-zA-Z0-9_]+)"?/i);
  if (createUniqueIdxMatch) {
    violations.push({ type: "MISSING_UNIQUE_INDEX", object: createUniqueIdxMatch[1], sql: stmt });
    continue;
  }

  // 3. Missing Regular Index: CREATE INDEX ...
  const createIdxMatch = stmt.match(/^CREATE\s+INDEX\s+(?:public\.)?"?([a-zA-Z0-9_]+)"?/i);
  if (createIdxMatch) {
    violations.push({ type: "MISSING_INDEX", object: createIdxMatch[1], sql: stmt });
    continue;
  }

  // 4. Missing Enum Type: CREATE TYPE ...
  const createTypeMatch = stmt.match(/^CREATE\s+TYPE\s+(?:public\.)?"?([a-zA-Z0-9_]+)"?/i);
  if (createTypeMatch) {
    violations.push({ type: "MISSING_ENUM_TYPE", object: createTypeMatch[1], sql: stmt });
    continue;
  }

  // 4b. Missing Enum Value: ALTER TYPE ... ADD VALUE ...
  const addEnumValueMatch = stmt.match(/^ALTER\s+TYPE\s+(?:public\.)?"?([a-zA-Z0-9_]+)"?\s+ADD\s+VALUE\s+('?[a-zA-Z0-9_]+'?)/i);
  if (addEnumValueMatch) {
    violations.push({ type: "MISSING_ENUM_VALUE", object: `${addEnumValueMatch[1]}.${addEnumValueMatch[2]}`, sql: stmt });
    continue;
  }

  // 5. Missing Column: ALTER TABLE ... ADD COLUMN ...
  const addColMatch = stmt.match(/^ALTER\s+TABLE\s+(?:public\.)?"?([a-zA-Z0-9_]+)"?\s+ADD\s+COLUMN\s+"?([a-zA-Z0-9_]+)"?/i);
  if (addColMatch) {
    violations.push({ type: "MISSING_COLUMN", object: `${addColMatch[1]}.${addColMatch[2]}`, sql: stmt });
    continue;
  }

  // 6. Missing Constraint / Foreign Key: ALTER TABLE ... ADD CONSTRAINT ...
  const addConstraintMatch = stmt.match(/^ALTER\s+TABLE\s+(?:public\.)?"?([a-zA-Z0-9_]+)"?\s+ADD\s+CONSTRAINT\s+"?([a-zA-Z0-9_]+)"?/i);
  if (addConstraintMatch) {
    violations.push({ type: "MISSING_CONSTRAINT", object: `${addConstraintMatch[1]}.${addConstraintMatch[2]}`, sql: stmt });
    continue;
  }

  // 7. Missing Nullability: ALTER TABLE ... ALTER COLUMN ... SET NOT NULL
  const setNotNullMatch = stmt.match(/^ALTER\s+TABLE\s+(?:public\.)?"?([a-zA-Z0-9_]+)"?\s+ALTER\s+COLUMN\s+"?([a-zA-Z0-9_]+)"?\s+SET\s+NOT\s+NULL/i);
  if (setNotNullMatch) {
    violations.push({ type: "NULLABILITY_DISPARITY", object: `${setNotNullMatch[1]}.${setNotNullMatch[2]}`, sql: stmt });
    continue;
  }

  // 8. Unexpected Column Type Change: ALTER TABLE ... ALTER COLUMN ... SET DATA TYPE
  const setDataTypeMatch = stmt.match(/^ALTER\s+TABLE\s+(?:public\.)?"?([a-zA-Z0-9_]+)"?\s+ALTER\s+COLUMN\s+"?([a-zA-Z0-9_]+)"?\s+SET\s+DATA\s+TYPE\s+([^,;]+)/i);
  if (setDataTypeMatch) {
    const colName = `${setDataTypeMatch[1]}.${setDataTypeMatch[2]}`;
    const newType = setDataTypeMatch[3].trim().toUpperCase();
    // Allow cosmetic PostgreSQL timestamp(6) -> Prisma timestamp(3) precision normalization
    if (newType.startsWith("TIMESTAMP(3)") || newType.startsWith("TIMESTAMPTZ(3)")) {
      // Allowed cosmetic timestamp representation difference
      continue;
    }
    violations.push({ type: "COLUMN_TYPE_DISPARITY", object: colName, sql: stmt });
    continue;
  }

  // 9. Unexpected Table Drop: Check if dropping a managed table (not in legacy allowlist)
  const dropTableMatch = stmt.match(/^DROP\s+TABLE\s+(?:public\.)?"?([a-zA-Z0-9_]+)"?/i);
  if (dropTableMatch) {
    const tableName = dropTableMatch[1];
    if (!LEGACY_UNMANAGED_TABLES.has(tableName)) {
      violations.push({ type: "UNEXPECTED_TABLE_DROP", object: tableName, sql: stmt });
    }
    continue;
  }

  // 10. Unexpected Index Drop: Check if dropping a managed index (not in legacy allowlist)
  const dropIdxMatch = stmt.match(/^DROP\s+INDEX\s+(?:public\.)?"?([a-zA-Z0-9_]+)"?/i);
  if (dropIdxMatch) {
    const indexName = dropIdxMatch[1];
    if (!LEGACY_UNMANAGED_INDEXES.has(indexName)) {
      violations.push({ type: "UNEXPECTED_INDEX_DROP", object: indexName, sql: stmt });
    }
    continue;
  }

  // 11. Allow cosmetic updatedAt DROP DEFAULT (Prisma client generates timestamps in JS)
  if (stmt.includes("DROP DEFAULT")) {
    continue;
  }

  // If any unhandled statement remains, fail closed!
  violations.push({ type: "UNRECOGNIZED_SCHEMA_DIFF", object: stmt.slice(0, 60), sql: stmt });
}

if (violations.length > 0) {
  console.error("\n❌ [Schema Drift Gate] FATAL: CRITICAL SCHEMA DRIFT DETECTED!");
  console.error(`Total Violations: ${violations.length}\n`);
  for (const v of violations) {
    console.error(`  - [${v.type}] ${v.object}`);
    console.error(`    SQL: ${v.sql}`);
  }
  console.error("\nProposed full migration diff:");
  console.error(diffOutput);
  console.error("\nDeployment Aborted: Production database is missing required schema objects.\n");
  process.exit(1);
}

console.log("✅ [Schema Drift Gate] Comprehensive schema verification passed. All tables, columns, indexes, constraints, and types are intact.");
process.exit(0);
