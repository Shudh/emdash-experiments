export const WF1_TABLES = [
	"ec_wf_asset_access",
	"ec_wf_asset_config_items",
	"ec_wf_asset_events",
	"ec_wf_asset_interests",
	"ec_wf_assets",
	"ec_wf_evidence_attachments",
	"ec_wf_tenant_documents",
	"ec_wf_workflow_card_responses",
	"ec_wf_workflow_cards",
	"ec_wf_workflow_definitions",
	"ec_wf_workflow_instances",
];

export const WF1_COLLECTION_BY_TABLE = Object.freeze({
	ec_wf_asset_access: "wf_asset_access",
	ec_wf_asset_config_items: "wf_asset_config_items",
	ec_wf_asset_events: "wf_asset_events",
	ec_wf_asset_interests: "wf_asset_interests",
	ec_wf_assets: "wf_assets",
	ec_wf_evidence_attachments: "wf_evidence_attachments",
	ec_wf_tenant_documents: "wf_tenant_documents",
	ec_wf_workflow_card_responses: "wf_workflow_card_responses",
	ec_wf_workflow_cards: "wf_workflow_cards",
	ec_wf_workflow_definitions: "wf_workflow_definitions",
	ec_wf_workflow_instances: "wf_workflow_instances",
});

export const GENERATED_COLUMN_ALLOWLIST = new Set([
	"primary_byline_id",
	"locale",
	"translation_group",
]);

const SAFE_IDENTIFIER_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function quoteIdentifier(identifier) {
	if (!SAFE_IDENTIFIER_PATTERN.test(identifier)) {
		throw new Error(`Unsafe SQL identifier: ${identifier}`);
	}
	return `"${identifier}"`;
}

export function tableInfo(db, tableName) {
	return db.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all();
}

export function selectedColumns(db, tableName) {
	return tableInfo(db, tableName)
		.map((column) => column.name)
		.filter((name) => !GENERATED_COLUMN_ALLOWLIST.has(name));
}

export function selectedRows(db, tableName, columns) {
	const refs = columns.map(quoteIdentifier).join(", ");
	return db.prepare(`SELECT ${refs} FROM ${quoteIdentifier(tableName)} ORDER BY slug, id`).all();
}

export function normalizeValue(value) {
	if (typeof value !== "string") return value;
	const trimmed = value.trim();
	if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
	try {
		return JSON.parse(trimmed);
	} catch {
		return value;
	}
}

export function normalizeRows(rows) {
	return rows.map((row) =>
		Object.fromEntries(Object.entries(row).map(([key, value]) => [key, normalizeValue(value)])),
	);
}
