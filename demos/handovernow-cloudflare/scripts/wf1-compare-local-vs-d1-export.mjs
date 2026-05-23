#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { normalizeRows, selectedColumns, selectedRows, WF1_TABLES } from "./wf1-shared.mjs";

const exportPath = resolve(process.argv[2] ?? "docs/generated/wf1-d1-selected-export.json");
const localDbPath = resolve(process.argv[3] ?? "db/handovernow_cms_local.db");

const d1Export = JSON.parse(readFileSync(exportPath, "utf8"));
const d1Tables = new Map(d1Export.tables.map((table) => [table.table, table]));
const localDb = new DatabaseSync(localDbPath);
let pass = true;

try {
	for (const table of WF1_TABLES) {
		const localColumns = selectedColumns(localDb, table);
		const d1 = d1Tables.get(table);
		if (!d1) {
			console.error(`Missing D1 export table: ${table}`);
			pass = false;
			continue;
		}
		const d1ColumnNames = d1.columns
			.map((column) => column.name)
			.filter((column) => localColumns.includes(column));
		const sameColumns = JSON.stringify(localColumns) === JSON.stringify(d1ColumnNames);
		const localRows = normalizeRows(selectedRows(localDb, table, localColumns));
		const d1Rows = normalizeRows(
			d1.rows
				.map((row) =>
					Object.fromEntries(localColumns.map((column) => [column, row[column] ?? null])),
				)
				.toSorted((a, b) => `${a.slug}:${a.id}`.localeCompare(`${b.slug}:${b.id}`)),
		);
		const sameRows = JSON.stringify(localRows) === JSON.stringify(d1Rows);
		if (!sameColumns || !sameRows) {
			console.error(`Mismatch for ${table}`);
			pass = false;
		}
	}

	if (!pass) process.exit(1);
	console.log(
		"PASS handovernow_cms_local.db matches real D1 handovernow_cms for selected WF1 schema/data",
	);
} finally {
	localDb.close();
}
