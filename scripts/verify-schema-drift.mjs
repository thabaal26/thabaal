#!/usr/bin/env node
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Automated Production Deployment Schema Drift Gate
 * Compares live database against current release's prisma/schema.prisma.
 * Fails closed if any table or column defined in the application schema is missing from the database.
 * Preserves unmanaged legacy tables (PortalMetaAlert, PortalMetaConnect, PortalMetaSignup) without false alarms.
 */

const schemaPath = path.resolve(process.env.PRISMA_SCHEMA || "prisma/schema.prisma");
if (!fs.existsSync(schemaPath)) {
  console.error(`[Schema Drift Gate] Error: Schema file not found at ${schemaPath}`);
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error("[Schema Drift Gate] Error: DATABASE_URL_UNPOOLED or DATABASE_URL must be set");
  process.exit(1);
}

console.log("[Schema Drift Gate] Running schema diff check against database...");

try {
  const diffOutput = execSync(
    `npx --yes prisma@6.19.3 migrate diff --from-url "${dbUrl}" --to-schema-datamodel "${schemaPath}" --script`,
    { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }
  );

  // Look specifically for missing tables and missing columns in the database
  const missingTables = [];
  const missingColumns = [];

  const lines = diffOutput.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const createMatch = line.match(/^CREATE TABLE\s+(?:public\.)?"?([a-zA-Z0-9_]+)"?/i);
    if (createMatch) {
      missingTables.push(createMatch[1]);
    }
    const addColMatch = line.match(/^ALTER TABLE\s+(?:public\.)?"?([a-zA-Z0-9_]+)"?\s+ADD COLUMN\s+"?([a-zA-Z0-9_]+)"?/i);
    if (addColMatch) {
      missingColumns.push(`${addColMatch[1]}.${addColMatch[2]}`);
    }
  }

  if (missingTables.length > 0 || missingColumns.length > 0) {
    console.error("\n❌ [Schema Drift Gate] CRITICAL SCHEMA DRIFT DETECTED!");
    if (missingTables.length > 0) {
      console.error(`Missing tables in database: ${missingTables.join(", ")}`);
    }
    if (missingColumns.length > 0) {
      console.error(`Missing columns in database: ${missingColumns.join(", ")}`);
    }
    console.error("\nFull proposed migration SQL to resolve drift:");
    console.error(diffOutput);
    console.error("\nDeployment aborted: Production database must be migrated prior to promoting release.\n");
    process.exit(1);
  }

  console.log("✅ [Schema Drift Gate] Database schema is fully aligned with application models. Zero missing entities.");
  process.exit(0);
} catch (err) {
  console.error("[Schema Drift Gate] Failed to execute prisma migrate diff:", err.message || err);
  process.exit(1);
}
