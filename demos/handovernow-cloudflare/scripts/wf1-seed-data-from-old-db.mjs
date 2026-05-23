#!/usr/bin/env node

import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import BetterSqlite3 from "better-sqlite3";

import { quoteIdentifier, selectedColumns, WF1_TABLES } from "./wf1-shared.mjs";

const oldDbPath = resolve(process.argv[2] ?? "db/old_wf1.db");
const targetDbPath = resolve(process.argv[3] ?? "db/handovernow_cms_local.db");

const oldDb = new DatabaseSync(oldDbPath);
const targetSqlite = new BetterSqlite3(targetDbPath);

try {
	targetSqlite.pragma("foreign_keys = on");
	const transaction = targetSqlite.transaction(() => {
		for (const table of WF1_TABLES) {
			const columns = selectedColumns(oldDb, table);
			const rows = oldDb
				.prepare(
					`SELECT ${columns.map(quoteIdentifier).join(", ")} FROM ${quoteIdentifier(
						table,
					)} ORDER BY created_at, id`,
				)
				.all();
			const insert = targetSqlite.prepare(
				`INSERT OR IGNORE INTO ${quoteIdentifier(table)} (${columns
					.map(quoteIdentifier)
					.join(", ")}) VALUES (${columns.map((column) => `@${column}`).join(", ")})`,
			);

			for (const row of rows) {
				insert.run(row);
			}
			console.log(`seeded ${rows.length} rows into ${table}`);
		}
	});
	transaction();
} finally {
	oldDb.close();
	targetSqlite.close();
}
