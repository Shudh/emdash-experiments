#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const dbPath = resolve(process.argv[2] ?? ".local/rental-sandbox/test.db");
const seedPath = resolve("demos/playground/seed/seed.json");

const rentalCollections = new Set([
	"assets",
	"asset_config_items",
	"asset_interests",
	"negotiation_rounds",
	"agreement_versions",
	"agreement_terms",
	"handover_sessions",
	"handover_item_checks",
	"asset_access",
	"asset_events",
	"tenancy_notices",
]);

const standardColumns = [
	["id", "text primary key"],
	["slug", "text not null"],
	["status", "text not null"],
	["author_id", "text"],
	["created_at", "text not null"],
	["updated_at", "text not null"],
	["published_at", "text"],
	["scheduled_at", "text"],
	["deleted_at", "text"],
	["version", "integer not null default 1"],
	["live_revision_id", "text"],
	["draft_revision_id", "text"],
];

function quoteIdentifier(identifier) {
	if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
		throw new Error(`Unsafe SQL identifier: ${identifier}`);
	}

	return `"${identifier}"`;
}

function fieldTypeToSql(type) {
	if (type === "number") return "real";
	if (type === "boolean") return "integer";
	return "text";
}

function readSeed() {
	if (!existsSync(seedPath)) {
		throw new Error(`Missing seed file: ${seedPath}`);
	}

	return JSON.parse(readFileSync(seedPath, "utf-8"));
}

function tableExists(db, tableName) {
	const row = db
		.prepare("select name from sqlite_master where type = 'table' and name = ?")
		.get(tableName);

	return !!row;
}

function columnExists(db, tableName, columnName) {
	const rows = db.prepare(`pragma table_info(${quoteIdentifier(tableName)})`).all();

	return rows.some((row) => row.name === columnName);
}

function uniqueColumns(columns) {
	const seen = new Set();
	const out = [];

	for (const column of columns) {
		const [name] = column;

		if (seen.has(name)) continue;

		seen.add(name);
		out.push(column);
	}

	return out;
}

function createTable(db, tableName, columns) {
	const columnSql = columns
		.map(([name, type]) => `${quoteIdentifier(name)} ${type}`)
		.join(",\n\t");

	db.exec(`create table if not exists ${quoteIdentifier(tableName)} (\n\t${columnSql}\n)`);
}

function addMissingColumns(db, tableName, columns) {
	for (const [name, type] of columns) {
		if (!columnExists(db, tableName, name)) {
			db.exec(`alter table ${quoteIdentifier(tableName)} add column ${quoteIdentifier(name)} ${type}`);
			console.log(`added ${tableName}.${name}`);
		}
	}
}

function createBasicIndexes(db, tableName) {
	const indexColumns = ["status", "author_id", "deleted_at"];

	for (const columnName of indexColumns) {
		if (columnExists(db, tableName, columnName)) {
			const indexName = `idx_${tableName}_${columnName}`;
			db.exec(
				`create index if not exists ${quoteIdentifier(indexName)} on ${quoteIdentifier(
					tableName,
				)} (${quoteIdentifier(columnName)})`,
			);
		}
	}
}

function createUsefulRentalIndexes(db) {
	const indexes = [
		["idx_ec_assets_owner_user_id", "ec_assets", ["owner_user_id"]],
		["idx_ec_assets_business_state", "ec_assets", ["business_state"]],
		["idx_ec_assets_visibility_state", "ec_assets", ["visibility_state"]],
		["idx_ec_asset_config_items_asset_id", "ec_asset_config_items", ["asset_id"]],
		["idx_ec_asset_interests_asset_id", "ec_asset_interests", ["asset_id"]],
		["idx_ec_asset_interests_interested_user_id", "ec_asset_interests", ["interested_user_id"]],
		["idx_ec_negotiation_rounds_interest_id", "ec_negotiation_rounds", ["interest_id"]],
		["idx_ec_negotiation_rounds_handover_id", "ec_negotiation_rounds", ["handover_id"]],
		["idx_ec_agreement_versions_asset_id", "ec_agreement_versions", ["asset_id"]],
		["idx_ec_agreement_versions_interest_id", "ec_agreement_versions", ["interest_id"]],
		["idx_ec_handover_sessions_asset_id", "ec_handover_sessions", ["asset_id"]],
		["idx_ec_handover_item_checks_handover_id", "ec_handover_item_checks", ["handover_id"]],
		["idx_ec_asset_access_asset_user", "ec_asset_access", ["asset_id", "user_id"]],
		["idx_ec_asset_events_asset_id", "ec_asset_events", ["asset_id"]],
		["idx_ec_tenancy_notices_asset_id", "ec_tenancy_notices", ["asset_id"]],
	];

	for (const [indexName, tableName, columns] of indexes) {
		if (!tableExists(db, tableName)) continue;

		const missingColumn = columns.find((columnName) => !columnExists(db, tableName, columnName));
		if (missingColumn) continue;

		const columnSql = columns.map(quoteIdentifier).join(", ");
		db.exec(
			`create index if not exists ${quoteIdentifier(indexName)} on ${quoteIdentifier(
				tableName,
			)} (${columnSql})`,
		);
	}
}

function main() {
	mkdirSync(dirname(dbPath), { recursive: true });

	const seed = readSeed();
	const db = new DatabaseSync(dbPath);

	try {
		db.exec("pragma foreign_keys = on");

		for (const collection of seed.collections ?? []) {
			if (!rentalCollections.has(collection.slug)) continue;

			const tableName = `ec_${collection.slug}`;
			const fieldColumns = (collection.fields ?? []).map((field) => [
				field.slug,
				fieldTypeToSql(field.type),
			]);
			const columns = uniqueColumns([...standardColumns, ...fieldColumns]);

			if (!tableExists(db, tableName)) {
				createTable(db, tableName, columns);
				console.log(`created ${tableName}`);
			} else {
				addMissingColumns(db, tableName, columns);
				console.log(`verified ${tableName}`);
			}

			createBasicIndexes(db, tableName);
		}

		createUsefulRentalIndexes(db);

		console.log(`ALM rental DB schema is ready: ${dbPath}`);
	} finally {
		db.close();
	}
}

main();