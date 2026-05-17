#!/usr/bin/env node
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const strict = process.argv.includes("--strict");
const dbFlagIndex = process.argv.indexOf("--db");
const dbPath = dbFlagIndex >= 0 ? process.argv[dbFlagIndex + 1] : undefined;

if (!dbPath) {
	console.error("Usage: node scripts/verify-alm-prod-schema.mjs --db <sqlite-db-path> [--strict]");
	process.exit(2);
}

if (!existsSync(dbPath)) {
	console.error(`Database does not exist: ${dbPath}`);
	process.exit(1);
}

const requiredTables = [
	"ec_assets",
	"ec_asset_config_items",
	"ec_asset_interests",
	"ec_negotiation_rounds",
	"ec_agreement_versions",
	"ec_agreement_terms",
	"ec_handover_sessions",
	"ec_handover_item_checks",
	"ec_asset_access",
	"ec_asset_events",
	"media",
];

const optionalFollowUpTables = ["ec_tenancy_notices"];

const db = new DatabaseSync(dbPath, { readOnly: true });
try {
	const rows = db
		.prepare("select name from sqlite_master where type = 'table'")
		.all()
		.map((row) => String(row.name));
	const tables = new Set(rows);
	let failed = false;
	for (const table of requiredTables) {
		const exists = tables.has(table);
		console.log(`${exists ? "ok" : "missing"} ${table}`);
		failed ||= !exists;
	}
	for (const table of optionalFollowUpTables) {
		console.log(`${tables.has(table) ? "ok" : "follow-up"} ${table}`);
	}
	if (failed && strict) process.exit(1);
	if (failed) {
		console.log("schema incomplete: pass --strict to fail on missing ALM production tables");
	}
} finally {
	db.close();
}
