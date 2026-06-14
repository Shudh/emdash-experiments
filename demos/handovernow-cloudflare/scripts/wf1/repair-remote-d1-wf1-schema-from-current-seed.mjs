import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DB_NAME = process.env.HN_D1_DB_NAME || "handovernow_cms";
const SEED_PATH = process.env.HN_SEED_PATH || "seed/seed.json";
const REPORT_DIR = process.env.HN_WF1_REPAIR_REPORT_DIR || "tmp/wf1-db-repair";
const APPLY = process.argv.includes("--apply");

const EMDASH_BASE_COLUMNS = new Set([
	"id",
	"slug",
	"status",
	"author_id",
	"primary_byline_id",
	"created_at",
	"updated_at",
	"published_at",
	"scheduled_at",
	"deleted_at",
	"version",
	"live_revision_id",
	"draft_revision_id",
	"locale",
	"translation_group",
]);

function quoteIdent(value) {
	return `"${String(value).replaceAll('"', '""')}"`;
}

function fail(message) {
	throw new Error(message);
}

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

	try {
		return JSON.parse(result.stdout);
	} catch (error) {
		console.error("Could not parse wrangler JSON output.");
		console.error(result.stdout);
		throw error;
	}
}

function collectResultRows(value, rows = []) {
	if (Array.isArray(value)) {
		for (const item of value) {
			collectResultRows(item, rows);
		}

		return rows;
	}

	if (value && typeof value === "object") {
		if (Array.isArray(value.results)) {
			rows.push(...value.results);
			return rows;
		}

		for (const nested of Object.values(value)) {
			collectResultRows(nested, rows);
		}
	}

	return rows;
}

function collectPragmaRows(value, rows = []) {
	if (Array.isArray(value)) {
		if (
			value.every(
				(item) =>
					item &&
					typeof item === "object" &&
					Object.prototype.hasOwnProperty.call(item, "cid") &&
					Object.prototype.hasOwnProperty.call(item, "name"),
			)
		) {
			rows.push(...value);
			return rows;
		}

		for (const item of value) {
			collectPragmaRows(item, rows);
		}

		return rows;
	}

	if (value && typeof value === "object") {
		for (const nested of Object.values(value)) {
			collectPragmaRows(nested, rows);
		}
	}

	return rows;
}

function tableExists(tableName) {
	const escaped = tableName.replaceAll("'", "''");
	const rows = collectResultRows(
		runSql(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${escaped}';`),
	);

	return rows.length > 0;
}

function columnsFor(tableName) {
	const rows = collectPragmaRows(runSql(`PRAGMA table_info(${quoteIdent(tableName)});`));
	return new Set(rows.map((row) => String(row.name)));
}

function rowCountFor(tableName) {
	const rows = collectResultRows(runSql(`SELECT COUNT(*) AS count FROM ${quoteIdent(tableName)};`));
	return Number(rows[0]?.count ?? 0);
}

function fieldTypeToSqlType(type) {
	if (type === "integer") return "INTEGER";
	if (type === "number") return "REAL";

	// EmDash stores json/text/string values safely as text-like columns in SQLite/D1.
	return "TEXT";
}

function seedWfCollections(seed) {
	return seed.collections
		.filter((collection) => String(collection.slug || "").startsWith("wf_"))
		.map((collection) => ({
			slug: String(collection.slug),
			tableName: `ec_${collection.slug}`,
			fields: collection.fields.map((field) => ({
				slug: String(field.slug),
				type: String(field.type || "string"),
			})),
		}));
}

function buildRepairPlan(seed) {
	const plan = {
		generatedAt: new Date().toISOString(),
		dbName: DB_NAME,
		seedPath: SEED_PATH,
		mode: APPLY ? "apply" : "dry-run",
		tables: {},
		addColumnStatements: [],
		missingTables: [],
		warnings: [],
	};

	for (const collection of seedWfCollections(seed)) {
		const exists = tableExists(collection.tableName);

		plan.tables[collection.tableName] = {
			exists,
			rowCount: exists ? rowCountFor(collection.tableName) : null,
			missingSeedColumns: [],
			extraNonSystemColumns: [],
		};

		if (!exists) {
			plan.missingTables.push(collection.tableName);
			continue;
		}

		const actualColumns = columnsFor(collection.tableName);
		const seedFieldNames = collection.fields.map((field) => field.slug);

		const extraNonSystem = [...actualColumns]
			.filter((column) => !EMDASH_BASE_COLUMNS.has(column))
			.filter((column) => !seedFieldNames.includes(column));

		plan.tables[collection.tableName].extraNonSystemColumns = extraNonSystem;

		for (const field of collection.fields) {
			if (actualColumns.has(field.slug)) continue;

			const sqlType = fieldTypeToSqlType(field.type);
			const statement = `ALTER TABLE ${quoteIdent(collection.tableName)} ADD COLUMN ${quoteIdent(field.slug)} ${sqlType};`;

			plan.tables[collection.tableName].missingSeedColumns.push({
				columnName: field.slug,
				seedType: field.type,
				sqlType,
			});

			plan.addColumnStatements.push({
				tableName: collection.tableName,
				columnName: field.slug,
				seedType: field.type,
				sqlType,
				sql: statement,
			});
		}

		if (extraNonSystem.length > 0) {
			plan.warnings.push({
				message: `${collection.tableName} has extra non-seed columns. These are ignored unless they are not EmDash base columns.`,
				tableName: collection.tableName,
				extraNonSystem,
			});
		}
	}

	return plan;
}

function printPlan(plan) {
	console.log("");
	console.log("WF1 remote D1 schema repair plan");
	console.log("");
	console.log(`DB: ${plan.dbName}`);
	console.log(`Seed: ${plan.seedPath}`);
	console.log(`Mode: ${plan.mode}`);
	console.log("");

	if (plan.missingTables.length > 0) {
		console.log("Missing tables:");
		for (const tableName of plan.missingTables) {
			console.log(`  ✗ ${tableName}`);
		}
		console.log("");
	}

	if (plan.addColumnStatements.length === 0) {
		console.log("No missing seed columns found.");
	} else {
		console.log("Columns to add:");
		for (const item of plan.addColumnStatements) {
			console.log(`  + ${item.tableName}.${item.columnName} ${item.sqlType}   seed type: ${item.seedType}`);
		}
	}

	if (plan.warnings.length > 0) {
		console.log("");
		console.log("Warnings:");
		for (const warning of plan.warnings) {
			console.log(`  ! ${warning.message}`);
			console.log(`    ${warning.extraNonSystem.join(", ")}`);
		}
	}

	console.log("");
}

function applyPlan(plan) {
	if (plan.missingTables.length > 0) {
		fail(
			[
				"One or more WF1 tables are missing.",
				"This repair script will not create tables because table creation belongs to EmDash seed/bootstrap.",
				"Use the safe reset wrapper only if you intentionally want a new remote D1.",
				`Missing tables: ${plan.missingTables.join(", ")}`,
			].join("\n"),
		);
	}

	if (plan.addColumnStatements.length === 0) {
		console.log("Nothing to apply.");
		return;
	}

	for (const item of plan.addColumnStatements) {
		console.log(`Applying: ${item.sql}`);
		runSql(item.sql);
	}
}

function backfillWorkflowCardResponseDerivedFields() {
	if (!tableExists("ec_wf_workflow_card_responses")) {
		console.log("Skipping response backfill: ec_wf_workflow_card_responses table is missing.");
		return;
	}

	const columns = columnsFor("ec_wf_workflow_card_responses");
	const needed = [
		"asset_id",
		"interest_id",
		"responded_by_user_id",
		"responded_by_role",
		"answer_value",
		"message",
	];

	const missing = needed.filter((column) => !columns.has(column));
	if (missing.length > 0) {
		console.log(`Skipping response backfill: still missing columns: ${missing.join(", ")}`);
		return;
	}

	const responseCount = rowCountFor("ec_wf_workflow_card_responses");
	console.log(`Backfilling derivable workflow response fields. Response rows: ${responseCount}`);

	if (responseCount === 0) {
		console.log("No response rows exist yet, so there is nothing to backfill.");
		return;
	}

	runSql(`
		UPDATE ec_wf_workflow_card_responses
		SET
			asset_id = (
				SELECT asset_id
				FROM ec_wf_workflow_instances
				WHERE ec_wf_workflow_instances.id = ec_wf_workflow_card_responses.workflow_instance_id
			),
			interest_id = (
				SELECT interest_id
				FROM ec_wf_workflow_instances
				WHERE ec_wf_workflow_instances.id = ec_wf_workflow_card_responses.workflow_instance_id
			)
		WHERE asset_id IS NULL OR interest_id IS NULL;
	`);

	runSql(`
		UPDATE ec_wf_workflow_card_responses
		SET responded_by_user_id = author_id
		WHERE responded_by_user_id IS NULL AND author_id IS NOT NULL;
	`);

	runSql(`
		UPDATE ec_wf_workflow_card_responses
		SET responded_by_role = CASE
			WHEN responded_by_user_id = (
				SELECT owner_user_id
				FROM ec_wf_workflow_instances
				WHERE ec_wf_workflow_instances.id = ec_wf_workflow_card_responses.workflow_instance_id
			) THEN 'owner'
			WHEN responded_by_user_id = (
				SELECT applicant_user_id
				FROM ec_wf_workflow_instances
				WHERE ec_wf_workflow_instances.id = ec_wf_workflow_card_responses.workflow_instance_id
			) THEN 'applicant'
			ELSE responded_by_role
		END
		WHERE responded_by_role IS NULL;
	`);

	console.log("Backfill complete. answer_value/message cannot be reconstructed if the old table never stored them.");
}

function main() {
	if (!fs.existsSync(SEED_PATH)) {
		fail(`Seed file not found: ${SEED_PATH}`);
	}

	const seed = JSON.parse(fs.readFileSync(SEED_PATH, "utf8"));
	const plan = buildRepairPlan(seed);

	fs.mkdirSync(REPORT_DIR, { recursive: true });
	const reportPath = path.join(
		REPORT_DIR,
		`wf1-d1-schema-repair-plan-${APPLY ? "applied" : "dry-run"}-${Date.now()}.json`,
	);
	fs.writeFileSync(reportPath, JSON.stringify(plan, null, 2));

	printPlan(plan);
	console.log(`Repair plan written to: ${reportPath}`);
	console.log("");

	if (!APPLY) {
		console.log("Dry run only. Re-run with --apply to execute the ALTER TABLE statements.");
		return;
	}

	applyPlan(plan);
	backfillWorkflowCardResponseDerivedFields();

	console.log("");
	console.log("Repair script completed.");
	console.log("");
	console.log("Run certification now:");
	console.log("  node scripts/wf1/certify-remote-d1-wf1-schema-and-test-corridor-data.mjs");
}

try {
	main();
} catch (error) {
	console.error("");
	console.error("FAILED");
	console.error(error instanceof Error ? error.message : error);
	console.error("");
	process.exitCode = 1;
}