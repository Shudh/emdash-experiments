#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { quoteIdentifier, tableInfo, WF1_TABLES } from "./wf1-shared.mjs";

const dbPath = resolve(process.argv[2] ?? "db/old_wf1.db");
const outPath = resolve("docs/generated/wf1-old-db-inventory.json");

const db = new DatabaseSync(dbPath);

try {
	const tables = db
		.prepare(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'ec_wf_%' ORDER BY name",
		)
		.all()
		.map((row) => row.name);
	const inventory = { dbPath, tables: [] };

	console.log(`WF1 tables in ${dbPath}:`);
	for (const table of tables) {
		const columns = tableInfo(db, table);
		const { count } = db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`).get();
		inventory.tables.push({ table, columns, rowCount: count });
		console.log(`\n${table}`);
		console.log(`rows: ${count}`);
		console.table(columns);
	}

	const missing = WF1_TABLES.filter((table) => !tables.includes(table));
	if (missing.length > 0) {
		console.error(`Missing expected WF1 tables: ${missing.join(", ")}`);
		process.exitCode = 1;
	}

	mkdirSync(dirname(outPath), { recursive: true });
	writeFileSync(outPath, `${JSON.stringify(inventory, null, 2)}\n`);
	console.log(`\nWrote ${outPath}`);
} finally {
	db.close();
}
