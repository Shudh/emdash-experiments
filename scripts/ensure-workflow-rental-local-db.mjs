#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const dbPath = resolve(process.argv[2] ?? ".local/workflow-rental-sandbox/test.db");
const sourceDbPath = resolve(process.argv[3] ?? ".local/rental-sandbox/test.db");

const workflowTables = {
	ec_wf_assets: [
		["title", "text"],
		["asset_kind", "text"],
		["owner_user_id", "text"],
		["business_state", "text"],
		["visibility_state", "text"],
		["public_price", "real"],
		["currency", "text"],
		["location_label", "text"],
		["minimum_months", "real"],
		["active_interest_id", "text"],
		["active_workflow_instance_id", "text"],
		["active_renter_user_id", "text"],
		["config_spec", "text"],
		["condition_spec", "text"],
		["config_version", "integer"],
		["owner_conditions_spec", "text"],
		["conditions_version", "integer"],
		["conditions_hash", "text"],
	],
	ec_wf_asset_config_items: [
		["asset_id", "text"],
		["item_kind", "text"],
		["item_group", "text"],
		["item_label", "text"],
		["item_state", "text"],
		["owner_declared_state", "text"],
		["item_spec", "text"],
		["media_refs", "text"],
	],
	ec_wf_asset_interests: [
		["asset_id", "text"],
		["asset_title", "text"],
		["asset_slug", "text"],
		["asset_kind", "text"],
		["asset_location_label", "text"],
		["asset_public_price", "real"],
		["owner_user_id", "text"],
		["interested_user_id", "text"],
		["workflow_instance_id", "text"],
		["interest_state", "text"],
		["name", "text"],
		["official_email", "text"],
		["phone", "text"],
		["employer_name", "text"],
		["offered_price", "real"],
		["requested_start_date", "text"],
		["requested_minimum_months", "real"],
		["message", "text"],
		["interest_spec", "text"],
		["accepted_conditions_version", "integer"],
		["accepted_conditions_hash", "text"],
		["accepted_conditions_at", "text"],
		["accepted_conditions_snapshot", "text"],
	],
	ec_wf_workflow_definitions: [
		["definition_id", "text"],
		["definition_version", "integer"],
		["scope_kind", "text"],
		["definition_spec", "text"],
	],
	ec_wf_workflow_instances: [
		["definition_id", "text"],
		["definition_version", "integer"],
		["scope_kind", "text"],
		["asset_id", "text"],
		["interest_id", "text"],
		["owner_user_id", "text"],
		["applicant_user_id", "text"],
		["workflow_state", "text"],
		["instance_spec", "text"],
	],
	ec_wf_workflow_cards: [
		["workflow_instance_id", "text"],
		["asset_id", "text"],
		["interest_id", "text"],
		["card_type", "text"],
		["card_state", "text"],
		["created_by_user_id", "text"],
		["created_by_role", "text"],
		["prompt", "text"],
		["answer_schema", "text"],
		["evidence_policy", "text"],
		["decision_policy", "text"],
		["card_spec", "text"],
		["decided_at", "text"],
		["decision", "text"],
	],
	ec_wf_workflow_card_responses: [
		["workflow_instance_id", "text"],
		["card_id", "text"],
		["asset_id", "text"],
		["interest_id", "text"],
		["responded_by_user_id", "text"],
		["responded_by_role", "text"],
		["answer_value", "text"],
		["message", "text"],
	],
	ec_wf_tenant_documents: [
		["owner_user_id", "text"],
		["document_kind", "text"],
		["document_label", "text"],
		["storage_key", "text"],
		["mime_type", "text"],
		["document_spec", "text"],
	],
	ec_wf_evidence_attachments: [
		["tenant_document_id", "text"],
		["asset_id", "text"],
		["interest_id", "text"],
		["workflow_instance_id", "text"],
		["card_id", "text"],
		["response_id", "text"],
		["owner_user_id", "text"],
		["applicant_user_id", "text"],
		["document_kind", "text"],
		["storage_key", "text"],
		["mime_type", "text"],
		["attachment_label", "text"],
		["attachment_spec", "text"],
	],
	ec_wf_asset_access: [
		["asset_id", "text"],
		["user_id", "text"],
		["access_role", "text"],
		["access_state", "text"],
		["granted_at", "text"],
		["revoked_at", "text"],
	],
	ec_wf_asset_events: [
		["asset_id", "text"],
		["interest_id", "text"],
		["workflow_instance_id", "text"],
		["card_id", "text"],
		["event_kind", "text"],
		["actor_user_id", "text"],
		["actor_role", "text"],
		["from_workflow_state", "text"],
		["to_workflow_state", "text"],
		["from_asset_state", "text"],
		["to_asset_state", "text"],
		["event_spec", "text"],
	],
};

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

const SAFE_IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function quoteIdentifier(identifier) {
	if (!SAFE_IDENTIFIER_PATTERN.test(identifier)) {
		throw new Error(`Unsafe SQL identifier: ${identifier}`);
	}
	return `"${identifier}"`;
}

function tableExists(db, tableName) {
	return !!db
		.prepare("select name from sqlite_master where type = 'table' and name = ?")
		.get(tableName);
}

function columnExists(db, tableName, columnName) {
	return db
		.prepare(`pragma table_info(${quoteIdentifier(tableName)})`)
		.all()
		.some((row) => row.name === columnName);
}

function uniqueColumns(columns) {
	const seen = new Set();
	return columns.filter(([name]) => {
		if (seen.has(name)) return false;
		seen.add(name);
		return true;
	});
}

function createTable(db, tableName, columns) {
	const columnSql = columns.map(([name, type]) => `${quoteIdentifier(name)} ${type}`).join(",\n\t");
	db.exec(`create table if not exists ${quoteIdentifier(tableName)} (\n\t${columnSql}\n)`);
}

function addMissingColumns(db, tableName, columns) {
	for (const [name, type] of columns) {
		if (!columnExists(db, tableName, name)) {
			db.exec(
				`alter table ${quoteIdentifier(tableName)} add column ${quoteIdentifier(name)} ${type}`,
			);
			console.log(`added ${tableName}.${name}`);
		}
	}
}

function createIndex(db, indexName, tableName, columns) {
	if (!tableExists(db, tableName)) return;
	if (columns.some((column) => !columnExists(db, tableName, column))) return;
	db.exec(
		`create index if not exists ${quoteIdentifier(indexName)} on ${quoteIdentifier(
			tableName,
		)} (${columns.map(quoteIdentifier).join(", ")})`,
	);
}

function ensureWorkflowDbCopied() {
	mkdirSync(dirname(dbPath), { recursive: true });
	if (existsSync(dbPath)) return false;
	if (!existsSync(sourceDbPath)) {
		throw new Error(`Source rental DB is missing: ${sourceDbPath}`);
	}
	copyFileSync(sourceDbPath, dbPath);
	return true;
}

function main() {
	const copied = ensureWorkflowDbCopied();
	const db = new DatabaseSync(dbPath);
	try {
		db.exec("pragma foreign_keys = on");
		for (const [tableName, tableColumns] of Object.entries(workflowTables)) {
			const columns = uniqueColumns([...standardColumns, ...tableColumns]);
			if (!tableExists(db, tableName)) {
				createTable(db, tableName, columns);
				console.log(`created ${tableName}`);
			} else {
				addMissingColumns(db, tableName, columns);
				console.log(`verified ${tableName}`);
			}
			for (const column of [
				"status",
				"slug",
				"created_at",
				"deleted_at",
				"scheduled_at",
				"live_revision_id",
				"draft_revision_id",
				"author_id",
				"updated_at",
			]) {
				createIndex(db, `idx_${tableName}_${column}`, tableName, [column]);
			}
		}
		createIndex(db, "idx_ec_wf_assets_owner_user_id", "ec_wf_assets", ["owner_user_id"]);
		createIndex(db, "idx_ec_wf_assets_business_state", "ec_wf_assets", ["business_state"]);
		createIndex(db, "idx_ec_wf_assets_visibility_state", "ec_wf_assets", ["visibility_state"]);
		createIndex(db, "idx_ec_wf_asset_config_items_asset_id", "ec_wf_asset_config_items", [
			"asset_id",
		]);
		createIndex(db, "idx_ec_wf_asset_interests_asset_id", "ec_wf_asset_interests", ["asset_id"]);
		createIndex(db, "idx_ec_wf_asset_interests_interested_user_id", "ec_wf_asset_interests", [
			"interested_user_id",
		]);
		createIndex(db, "idx_ec_wf_workflow_instances_asset_interest", "ec_wf_workflow_instances", [
			"asset_id",
			"interest_id",
		]);
		createIndex(db, "idx_ec_wf_workflow_cards_instance", "ec_wf_workflow_cards", [
			"workflow_instance_id",
		]);
		createIndex(db, "idx_ec_wf_workflow_card_responses_card_id", "ec_wf_workflow_card_responses", [
			"card_id",
		]);
		createIndex(db, "idx_ec_wf_evidence_attachments_card_id", "ec_wf_evidence_attachments", [
			"card_id",
		]);
		createIndex(db, "idx_ec_wf_asset_access_asset_user", "ec_wf_asset_access", [
			"asset_id",
			"user_id",
		]);
		createIndex(db, "idx_ec_wf_asset_events_asset_id", "ec_wf_asset_events", ["asset_id"]);
		console.log(`Workflow rental DB schema is ready: ${dbPath}`);
		if (copied) console.log(`Source auth DB copied from: ${sourceDbPath}`);
	} finally {
		db.close();
	}
}

main();
