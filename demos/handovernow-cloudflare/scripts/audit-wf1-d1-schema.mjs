import fs from "node:fs";
import { spawnSync } from "node:child_process";

const DB_NAME = "handovernow_cms";
const seed = JSON.parse(fs.readFileSync("seed/seed.json", "utf8"));

const emdashBaseColumns = new Set([
  "id",
  "slug",
  "status",
  "author_id",
  "created_at",
  "updated_at",
  "published_at",
  "deleted_at",
  "primary_byline_id",
  "scheduled_at",
  "version",
  "live_revision_id",
  "draft_revision_id",
  "locale",
  "translation_group",
]);

function runSql(sql) {
  const result = spawnSync(
    "pnpm",
    ["exec", "wrangler", "d1", "execute", DB_NAME, "--remote", "--json", "--command", sql],
    { encoding: "utf8" },
  );

  if (result.status !== 0) {
    console.error(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }

  return JSON.parse(result.stdout);
}

function collectRows(value, rows = []) {
  if (Array.isArray(value)) {
    if (value.every((item) => item && typeof item === "object" && "name" in item && "cid" in item)) {
      rows.push(...value);
      return rows;
    }

    for (const item of value) collectRows(item, rows);
    return rows;
  }

  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) collectRows(nested, rows);
  }

  return rows;
}

function actualColumnsFor(tableName) {
  const json = runSql(`PRAGMA table_info(${tableName});`);
  return new Set(collectRows(json).map((row) => String(row.name)));
}

const wfCollections = seed.collections.filter((collection) =>
  String(collection.slug || "").startsWith("wf_"),
);

let failed = false;

for (const collection of wfCollections) {
  const slug = String(collection.slug);
  const tableName = `ec_${slug}`;
  const expectedFields = collection.fields.map((field) => String(field.slug));
  const actualColumns = actualColumnsFor(tableName);

  if (actualColumns.size === 0) {
    failed = true;
    console.log(`MISSING TABLE ${tableName}`);
    continue;
  }

  const missing = expectedFields.filter((field) => !actualColumns.has(field));
  const extraNonSystem = [...actualColumns]
    .filter((column) => !emdashBaseColumns.has(column))
    .filter((column) => !expectedFields.includes(column));

  if (missing.length > 0 || extraNonSystem.length > 0) {
    failed = true;
    console.log(`\n${tableName}`);
    if (missing.length > 0) console.log(`  missing from remote D1: ${missing.join(", ")}`);
    if (extraNonSystem.length > 0) console.log(`  extra non-seed columns: ${extraNonSystem.join(", ")}`);
  }
}

if (!failed) {
  console.log("OK: remote D1 WF1 tables match seed/seed.json fields, ignoring EmDash base columns.");
}
