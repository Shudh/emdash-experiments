#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { WF1_TABLES } from "./wf1-shared.mjs";

const outPath = resolve("docs/generated/wf1-d1-selected-export.json");
const databaseName = process.argv[2] ?? "handovernow_cms";

function runD1(command) {
	const output = execFileSync(
		"pnpm",
		["exec", "wrangler", "d1", "execute", databaseName, "--remote", "--json", "--command", command],
		{ encoding: "utf8" },
	);
	return JSON.parse(output);
}

const exportData = { databaseName, tables: [] };

for (const table of WF1_TABLES) {
	const schema = runD1(`PRAGMA table_info("${table}")`);
	const rows = runD1(`SELECT * FROM "${table}" ORDER BY slug, id`);
	exportData.tables.push({
		table,
		columns: schema[0]?.results ?? [],
		rows: rows[0]?.results ?? [],
	});
	console.log(`exported ${table}: ${rows[0]?.results?.length ?? 0} rows`);
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(exportData, null, 2)}\n`);
console.log(`Wrote ${outPath}`);
