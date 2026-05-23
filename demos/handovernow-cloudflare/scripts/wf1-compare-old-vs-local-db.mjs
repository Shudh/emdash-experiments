#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { normalizeRows, selectedColumns, selectedRows, WF1_TABLES } from "./wf1-shared.mjs";

const oldDbPath = resolve(process.argv[2] ?? "db/old_wf1.db");
const localDbPath = resolve(process.argv[3] ?? "db/handovernow_cms_local.db");
const outPath = resolve("docs/generated/wf1-old-vs-local-db-comparison.json");

const oldDb = new DatabaseSync(oldDbPath);
const localDb = new DatabaseSync(localDbPath);
const report = { oldDbPath, localDbPath, tables: [], pass: true };

try {
	for (const table of WF1_TABLES) {
		const oldColumns = selectedColumns(oldDb, table);
		const localColumns = selectedColumns(localDb, table).filter((column) =>
			oldColumns.includes(column),
		);
		const sameColumns = JSON.stringify(oldColumns) === JSON.stringify(localColumns);
		const oldRows = normalizeRows(selectedRows(oldDb, table, oldColumns));
		const localRows = normalizeRows(selectedRows(localDb, table, oldColumns));
		const sameRows = JSON.stringify(oldRows) === JSON.stringify(localRows);
		const entry = {
			table,
			oldColumns,
			localColumns,
			sameColumns,
			oldRowCount: oldRows.length,
			localRowCount: localRows.length,
			sameRows,
		};
		report.tables.push(entry);
		if (!sameColumns || !sameRows) report.pass = false;
	}

	mkdirSync(dirname(outPath), { recursive: true });
	writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

	if (!report.pass) {
		console.error(`FAIL old_wf1.db does not match handovernow_cms_local.db`);
		console.error(`Wrote ${outPath}`);
		process.exit(1);
	}
	console.log("PASS old_wf1.db matches handovernow_cms_local.db for selected WF1 schema/data");
	console.log(`Wrote ${outPath}`);
} finally {
	oldDb.close();
	localDb.close();
}
