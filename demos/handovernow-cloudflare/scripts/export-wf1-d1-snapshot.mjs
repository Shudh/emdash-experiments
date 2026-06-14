import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DB_NAME = "handovernow_cms";
const seed = JSON.parse(fs.readFileSync("seed/seed.json", "utf8"));
const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const outDir = path.join("tmp", `wf1-d1-snapshot-${stamp}`);

fs.mkdirSync(outDir, { recursive: true });

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

function collectResultRows(value, rows = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectResultRows(item, rows);
    return rows;
  }

  if (value && typeof value === "object") {
    if (Array.isArray(value.results)) {
      rows.push(...value.results);
      return rows;
    }

    for (const nested of Object.values(value)) collectResultRows(nested, rows);
  }

  return rows;
}

function collectPragmaRows(value, rows = []) {
  if (Array.isArray(value)) {
    if (value.every((item) => item && typeof item === "object" && "name" in item && "cid" in item)) {
      rows.push(...value);
      return rows;
    }

    for (const item of value) collectPragmaRows(item, rows);
    return rows;
  }

  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) collectPragmaRows(nested, rows);
  }

  return rows;
}

function quoteIdent(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "1" : "0";

  if (typeof value === "object") {
    return `'${JSON.stringify(value).replaceAll("'", "''")}'`;
  }

  return `'${String(value).replaceAll("'", "''")}'`;
}

function insertSql(tableName, rows, columns) {
  const statements = [];

  for (const row of rows) {
    const values = columns.map((column) => sqlValue(row[column]));
    statements.push(
      `INSERT INTO ${quoteIdent(tableName)} (${columns.map(quoteIdent).join(", ")}) VALUES (${values.join(", ")});`
    );
  }

  return statements.join("\n");
}

const wfCollections = seed.collections
  .filter((collection) => String(collection.slug || "").startsWith("wf_"))
  .map((collection) => String(collection.slug));

const manifest = {
  exportedAt: new Date().toISOString(),
  dbName: DB_NAME,
  tables: {},
};

for (const slug of wfCollections) {
  const tableName = `ec_${slug}`;
  const pragmaJson = runSql(`PRAGMA table_info(${tableName});`);
  const schemaRows = collectPragmaRows(pragmaJson);
  const columns = schemaRows.map((row) => String(row.name));

  const dataJson = runSql(`SELECT * FROM ${tableName} ORDER BY created_at ASC, id ASC;`);
  const rows = collectResultRows(dataJson);

  manifest.tables[tableName] = {
    columns,
    rowCount: rows.length,
  };

  fs.writeFileSync(path.join(outDir, `${tableName}.schema.json`), JSON.stringify(schemaRows, null, 2));
  fs.writeFileSync(path.join(outDir, `${tableName}.rows.json`), JSON.stringify(rows, null, 2));
  fs.writeFileSync(path.join(outDir, `${tableName}.insert.sql`), insertSql(tableName, rows, columns));
}

fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));

console.log(`Exported WF1 D1 snapshot to ${outDir}`);
console.log(JSON.stringify(manifest, null, 2));
