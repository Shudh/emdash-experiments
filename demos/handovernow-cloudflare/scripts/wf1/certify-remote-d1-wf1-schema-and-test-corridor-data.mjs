import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DB_NAME = process.env.HN_D1_DB_NAME || "handovernow_cms";
const SEED_PATH = process.env.HN_SEED_PATH || "seed/seed.json";
const REPORT_DIR = process.env.HN_WF1_REPORT_DIR || "tmp/wf1-db-certification";
const ALLOW_EMPTY = process.argv.includes("--allow-empty");

const EXPECTED_TEST_USERS = {
	shudh: "shudh.datta@gmail.com",
	raphael: "raphael.datta.2009@gmail.com",
};

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

function logSection(title) {
	console.log("");
	console.log(`▶ ${title}`);
}

function fail(message) {
	throw new Error(message);
}

function quoteIdent(value) {
	return `"${String(value).replaceAll('"', '""')}"`;
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
					Object.hasOwn(item, "cid") &&
					Object.hasOwn(item, "name"),
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

function getTableColumns(tableName) {
	const pragmaRows = collectPragmaRows(runSql(`PRAGMA table_info(${quoteIdent(tableName)});`));
	return pragmaRows.map((row) => String(row.name));
}

function tableExists(tableName) {
	const escaped = String(tableName).replaceAll("'", "''");
	const rows = collectResultRows(
		runSql(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${escaped}';`),
	);

	return rows.length > 0;
}

function getRows(tableName) {
	if (!tableExists(tableName)) {
		return [];
	}

	return collectResultRows(
		runSql(`SELECT * FROM ${quoteIdent(tableName)} ORDER BY created_at ASC, id ASC;`),
	);
}

function parseMaybeJson(value) {
	if (!value) {
		return {};
	}

	if (typeof value === "object" && !Array.isArray(value)) {
		return value;
	}

	if (typeof value !== "string") {
		return {};
	}

	try {
		const parsed = JSON.parse(value);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

function isTestLaneAsset(asset) {
	const configSpec = parseMaybeJson(asset.config_spec);
	const testLane = parseMaybeJson(configSpec.testLane);

	return testLane.enabled === true || testLane.enabled === 1;
}

function seedCollections(seed) {
	return seed.collections
		.filter((collection) => String(collection.slug || "").startsWith("wf_"))
		.map((collection) => ({
			slug: String(collection.slug),
			tableName: `ec_${collection.slug}`,
			fields: collection.fields.map((field) => String(field.slug)),
		}));
}

function indexById(rows) {
	return new Map(rows.map((row) => [String(row.id), row]));
}

function pushError(report, message, detail = undefined) {
	report.errors.push(detail === undefined ? { message } : { message, detail });
}

function pushWarning(report, message, detail = undefined) {
	report.warnings.push(detail === undefined ? { message } : { message, detail });
}

function countByLane(rows, assetsById) {
	const counts = {
		test: 0,
		public: 0,
		unknown: 0,
	};

	for (const row of rows) {
		const assetId = row.asset_id;

		if (!assetId) {
			counts.unknown += 1;
			continue;
		}

		const asset = assetsById.get(String(assetId));

		if (!asset) {
			counts.unknown += 1;
			continue;
		}

		if (isTestLaneAsset(asset)) {
			counts.test += 1;
		} else {
			counts.public += 1;
		}
	}

	return counts;
}

function roleForWorkflowUserId(userId, instance) {
	if (!userId || !instance) {
		return "";
	}

	if (String(userId) === String(instance.owner_user_id)) {
		return "owner";
	}

	if (String(userId) === String(instance.applicant_user_id)) {
		return "applicant";
	}

	return "";
}

function certifySchema(seed, report) {
	logSection("Checking WF1 table schema against seed/seed.json");

	for (const collection of seedCollections(seed)) {
		const exists = tableExists(collection.tableName);

		report.tables[collection.tableName] ??= {
			exists,
			columns: [],
			missingSeedColumns: [],
			extraNonSystemColumns: [],
		};

		if (!exists) {
			pushError(report, `Missing WF1 table ${collection.tableName}`);
			continue;
		}

		const actualColumns = new Set(getTableColumns(collection.tableName));
		const missing = collection.fields.filter((field) => !actualColumns.has(field));
		const extraNonSystem = [...actualColumns]
			.filter((column) => !EMDASH_BASE_COLUMNS.has(column))
			.filter((column) => !collection.fields.includes(column));

		report.tables[collection.tableName] = {
			exists: true,
			columns: [...actualColumns],
			missingSeedColumns: missing,
			extraNonSystemColumns: extraNonSystem,
		};

		if (missing.length > 0) {
			pushError(report, `${collection.tableName} is missing seed columns`, missing);
		}

		if (extraNonSystem.length > 0) {
			pushWarning(report, `${collection.tableName} has extra non-seed columns`, extraNonSystem);
		}
	}
}

function certifyData(report) {
	logSection("Loading WF1 rows");

	const rows = {
		assets: getRows("ec_wf_assets"),
		assetConfigItems: getRows("ec_wf_asset_config_items"),
		interests: getRows("ec_wf_asset_interests"),
		workflowDefinitions: getRows("ec_wf_workflow_definitions"),
		workflowInstances: getRows("ec_wf_workflow_instances"),
		workflowCards: getRows("ec_wf_workflow_cards"),
		workflowCardResponses: getRows("ec_wf_workflow_card_responses"),
		tenantDocuments: getRows("ec_wf_tenant_documents"),
		evidenceAttachments: getRows("ec_wf_evidence_attachments"),
		assetAccess: getRows("ec_wf_asset_access"),
		assetEvents: getRows("ec_wf_asset_events"),
	};

	for (const [name, tableRows] of Object.entries(rows)) {
		report.rowCounts[name] = tableRows.length;
	}

	const assetsById = indexById(rows.assets);
	const interestsById = indexById(rows.interests);
	const instancesById = indexById(rows.workflowInstances);
	const cardsById = indexById(rows.workflowCards);
	const responsesById = indexById(rows.workflowCardResponses);

	const testAssets = rows.assets.filter(isTestLaneAsset);
	const publicAssets = rows.assets.filter((asset) => !isTestLaneAsset(asset));

	report.lanes = {
		testAssetCount: testAssets.length,
		publicAssetCount: publicAssets.length,
		testAssetIds: testAssets.map((asset) => asset.id),
		publicAssetIds: publicAssets.map((asset) => asset.id),
		childCountsByLane: {
			assetConfigItems: countByLane(rows.assetConfigItems, assetsById),
			interests: countByLane(rows.interests, assetsById),
			workflowInstances: countByLane(rows.workflowInstances, assetsById),
			workflowCards: countByLane(rows.workflowCards, assetsById),
			workflowCardResponses: countByLane(rows.workflowCardResponses, assetsById),
			evidenceAttachments: countByLane(rows.evidenceAttachments, assetsById),
			assetAccess: countByLane(rows.assetAccess, assetsById),
			assetEvents: countByLane(rows.assetEvents, assetsById),
		},
	};

	if (!ALLOW_EMPTY && rows.assets.length === 0) {
		pushError(report, "No WF1 assets exist. Use --allow-empty only immediately after a clean DB reset.");
	}

	for (const item of rows.assetConfigItems) {
		if (!assetsById.has(String(item.asset_id))) {
			pushError(report, "Asset config item points to missing asset", {
				id: item.id,
				asset_id: item.asset_id,
			});
		}
	}

	for (const interest of rows.interests) {
		const asset = assetsById.get(String(interest.asset_id));

		if (!asset) {
			pushError(report, "Interest points to missing asset", {
				id: interest.id,
				asset_id: interest.asset_id,
			});
			continue;
		}

		if (String(interest.owner_user_id) !== String(asset.owner_user_id)) {
			pushError(report, "Interest owner_user_id does not match asset owner_user_id", {
				interestId: interest.id,
				interestOwnerUserId: interest.owner_user_id,
				assetOwnerUserId: asset.owner_user_id,
			});
		}

		if (interest.workflow_instance_id && !instancesById.has(String(interest.workflow_instance_id))) {
			pushError(report, "Interest points to missing workflow instance", {
				interestId: interest.id,
				workflowInstanceId: interest.workflow_instance_id,
			});
		}
	}

	for (const instance of rows.workflowInstances) {
		const asset = assetsById.get(String(instance.asset_id));
		const interest = interestsById.get(String(instance.interest_id));

		if (!asset) {
			pushError(report, "Workflow instance points to missing asset", {
				instanceId: instance.id,
				assetId: instance.asset_id,
			});
		}

		if (!interest) {
			pushError(report, "Workflow instance points to missing interest", {
				instanceId: instance.id,
				interestId: instance.interest_id,
			});
		}

		if (asset && String(instance.owner_user_id) !== String(asset.owner_user_id)) {
			pushError(report, "Workflow instance owner_user_id does not match asset owner_user_id", {
				instanceId: instance.id,
				instanceOwnerUserId: instance.owner_user_id,
				assetOwnerUserId: asset.owner_user_id,
			});
		}

		if (interest && String(instance.applicant_user_id) !== String(interest.interested_user_id)) {
			pushError(report, "Workflow instance applicant_user_id does not match interest interested_user_id", {
				instanceId: instance.id,
				instanceApplicantUserId: instance.applicant_user_id,
				interestInterestedUserId: interest.interested_user_id,
			});
		}
	}

	for (const card of rows.workflowCards) {
		const instance = instancesById.get(String(card.workflow_instance_id));

		if (!instance) {
			pushError(report, "Workflow card points to missing workflow instance", {
				cardId: card.id,
				workflowInstanceId: card.workflow_instance_id,
			});
			continue;
		}

		if (String(card.asset_id) !== String(instance.asset_id)) {
			pushError(report, "Workflow card asset_id does not match instance asset_id", {
				cardId: card.id,
				cardAssetId: card.asset_id,
				instanceAssetId: instance.asset_id,
			});
		}

		if (String(card.interest_id) !== String(instance.interest_id)) {
			pushError(report, "Workflow card interest_id does not match instance interest_id", {
				cardId: card.id,
				cardInterestId: card.interest_id,
				instanceInterestId: instance.interest_id,
			});
		}

		if (!card.created_by_user_id) {
			pushError(report, "Workflow card is missing created_by_user_id", {
				cardId: card.id,
			});
		}

		if (!card.created_by_role) {
			pushError(report, "Workflow card is missing created_by_role", {
				cardId: card.id,
			});
		}
	}

	for (const response of rows.workflowCardResponses) {
		const card = cardsById.get(String(response.card_id));
		const instance = instancesById.get(String(response.workflow_instance_id));

		if (!card) {
			pushError(report, "Workflow card response points to missing card", {
				responseId: response.id,
				cardId: response.card_id,
			});
		}

		if (!instance) {
			pushError(report, "Workflow card response points to missing workflow instance", {
				responseId: response.id,
				workflowInstanceId: response.workflow_instance_id,
			});
		}

		if (card && String(response.workflow_instance_id) !== String(card.workflow_instance_id)) {
			pushError(report, "Response workflow_instance_id does not match card workflow_instance_id", {
				responseId: response.id,
				cardId: card.id,
				responseWorkflowInstanceId: response.workflow_instance_id,
				cardWorkflowInstanceId: card.workflow_instance_id,
			});
		}

		if (card && response.asset_id && String(response.asset_id) !== String(card.asset_id)) {
			pushError(report, "Response asset_id does not match card asset_id", {
				responseId: response.id,
				responseAssetId: response.asset_id,
				cardAssetId: card.asset_id,
			});
		}

		if (card && response.interest_id && String(response.interest_id) !== String(card.interest_id)) {
			pushError(report, "Response interest_id does not match card interest_id", {
				responseId: response.id,
				responseInterestId: response.interest_id,
				cardInterestId: card.interest_id,
			});
		}

		if (!response.responded_by_user_id) {
			pushError(report, "Response is missing responded_by_user_id", {
				responseId: response.id,
			});
		}

		if (!response.responded_by_role) {
			pushError(report, "Response is missing responded_by_role", {
				responseId: response.id,
			});
		}

		if (!response.answer_value) {
			pushError(report, "Response is missing answer_value", {
				responseId: response.id,
			});
		}

		if (response.responded_by_user_id && instance) {
			const inferredRole = roleForWorkflowUserId(String(response.responded_by_user_id), instance);

			if (inferredRole && response.responded_by_role && inferredRole !== response.responded_by_role) {
				pushError(report, "Response responded_by_role does not match workflow participant", {
					responseId: response.id,
					respondedByUserId: response.responded_by_user_id,
					respondedByRole: response.responded_by_role,
					inferredRole,
				});
			}
		}
	}

	for (const attachment of rows.evidenceAttachments) {
		if (attachment.asset_id && !assetsById.has(String(attachment.asset_id))) {
			pushError(report, "Evidence attachment points to missing asset", {
				attachmentId: attachment.id,
				assetId: attachment.asset_id,
			});
		}

		if (attachment.interest_id && !interestsById.has(String(attachment.interest_id))) {
			pushError(report, "Evidence attachment points to missing interest", {
				attachmentId: attachment.id,
				interestId: attachment.interest_id,
			});
		}

		if (attachment.workflow_instance_id && !instancesById.has(String(attachment.workflow_instance_id))) {
			pushError(report, "Evidence attachment points to missing workflow instance", {
				attachmentId: attachment.id,
				workflowInstanceId: attachment.workflow_instance_id,
			});
		}

		if (attachment.card_id && !cardsById.has(String(attachment.card_id))) {
			pushError(report, "Evidence attachment points to missing card", {
				attachmentId: attachment.id,
				cardId: attachment.card_id,
			});
		}

		if (attachment.response_id && !responsesById.has(String(attachment.response_id))) {
			pushError(report, "Evidence attachment points to missing response", {
				attachmentId: attachment.id,
				responseId: attachment.response_id,
			});
		}
	}

	for (const access of rows.assetAccess) {
		if (!assetsById.has(String(access.asset_id))) {
			pushError(report, "Asset access row points to missing asset", {
				accessId: access.id,
				assetId: access.asset_id,
			});
		}
	}

	for (const event of rows.assetEvents) {
		if (event.asset_id && !assetsById.has(String(event.asset_id))) {
			pushError(report, "Event points to missing asset", {
				eventId: event.id,
				assetId: event.asset_id,
			});
		}

		if (event.interest_id && !interestsById.has(String(event.interest_id))) {
			pushError(report, "Event points to missing interest", {
				eventId: event.id,
				interestId: event.interest_id,
			});
		}

		if (event.workflow_instance_id && !instancesById.has(String(event.workflow_instance_id))) {
			pushError(report, "Event points to missing workflow instance", {
				eventId: event.id,
				workflowInstanceId: event.workflow_instance_id,
			});
		}

		if (event.card_id && !cardsById.has(String(event.card_id))) {
			pushError(report, "Event points to missing card", {
				eventId: event.id,
				cardId: event.card_id,
			});
		}
	}

	report.userIdsSeenInWf1 = Array.from(
		new Set(
			[
				...rows.assets.map((row) => row.owner_user_id),
				...rows.assets.map((row) => row.author_id),
				...rows.interests.map((row) => row.owner_user_id),
				...rows.interests.map((row) => row.interested_user_id),
				...rows.workflowInstances.map((row) => row.owner_user_id),
				...rows.workflowInstances.map((row) => row.applicant_user_id),
				...rows.workflowCards.map((row) => row.created_by_user_id),
				...rows.workflowCardResponses.map((row) => row.responded_by_user_id),
				...rows.assetEvents.map((row) => row.actor_user_id),
				...rows.assetAccess.map((row) => row.user_id),
			]
				.filter(Boolean)
				.map(String),
		),
	);

	return rows;
}

function collectWf1IdentityEvidence(rows, report) {
	logSection("Checking WF1 identity evidence");

	const identityEvidence = {
		expectedEmails: EXPECTED_TEST_USERS,
		ownerEmailsSeenInTestLaneMarkers: [],
		officialEmailsSeenInInterests: [],
		ownerUserIdsSeen: [],
		applicantUserIdsSeen: [],
		actorUserIdsSeen: [],
	};

	for (const asset of rows.assets) {
		const configSpec = parseMaybeJson(asset.config_spec);
		const testLane = parseMaybeJson(configSpec.testLane);

		if (typeof testLane.ownerEmail === "string" && testLane.ownerEmail.trim() !== "") {
			identityEvidence.ownerEmailsSeenInTestLaneMarkers.push({
				assetId: asset.id,
				ownerEmail: testLane.ownerEmail.trim().toLowerCase(),
				ownerUserId: asset.owner_user_id ?? null,
			});
		}

		if (asset.owner_user_id) {
			identityEvidence.ownerUserIdsSeen.push(String(asset.owner_user_id));
		}
	}

	for (const interest of rows.interests) {
		if (typeof interest.official_email === "string" && interest.official_email.trim() !== "") {
			identityEvidence.officialEmailsSeenInInterests.push({
				interestId: interest.id,
				officialEmail: interest.official_email.trim().toLowerCase(),
				interestedUserId: interest.interested_user_id ?? null,
			});
		}

		if (interest.owner_user_id) {
			identityEvidence.ownerUserIdsSeen.push(String(interest.owner_user_id));
		}

		if (interest.interested_user_id) {
			identityEvidence.applicantUserIdsSeen.push(String(interest.interested_user_id));
		}
	}

	for (const instance of rows.workflowInstances) {
		if (instance.owner_user_id) {
			identityEvidence.ownerUserIdsSeen.push(String(instance.owner_user_id));
		}

		if (instance.applicant_user_id) {
			identityEvidence.applicantUserIdsSeen.push(String(instance.applicant_user_id));
		}
	}

	for (const card of rows.workflowCards) {
		if (card.created_by_user_id) {
			identityEvidence.actorUserIdsSeen.push(String(card.created_by_user_id));
		}
	}

	for (const response of rows.workflowCardResponses) {
		if (response.responded_by_user_id) {
			identityEvidence.actorUserIdsSeen.push(String(response.responded_by_user_id));
		}
	}

	for (const event of rows.assetEvents) {
		if (event.actor_user_id) {
			identityEvidence.actorUserIdsSeen.push(String(event.actor_user_id));
		}
	}

	identityEvidence.ownerUserIdsSeen = [...new Set(identityEvidence.ownerUserIdsSeen)];
	identityEvidence.applicantUserIdsSeen = [...new Set(identityEvidence.applicantUserIdsSeen)];
	identityEvidence.actorUserIdsSeen = [...new Set(identityEvidence.actorUserIdsSeen)];

	report.identityEvidence = identityEvidence;

	const shudhEmailSeen = identityEvidence.ownerEmailsSeenInTestLaneMarkers.some(
		(row) => row.ownerEmail === EXPECTED_TEST_USERS.shudh,
	);

	const raphaelEmailSeen = identityEvidence.officialEmailsSeenInInterests.some(
		(row) => row.officialEmail === EXPECTED_TEST_USERS.raphael,
	);

	if (!shudhEmailSeen) {
		pushWarning(
			report,
			"Shudh email was not found in test-lane asset markers. This is normal before creating a test-corridor asset as Shudh.",
			{ expectedEmail: EXPECTED_TEST_USERS.shudh },
		);
	}

	if (!raphaelEmailSeen) {
		pushWarning(
			report,
			"Raphael email was not found in WF1 interest official_email. This is normal before Raphael submits a test-corridor application.",
			{ expectedEmail: EXPECTED_TEST_USERS.raphael },
		);
	}

	console.log("  ✓ WF1 identity evidence checked without scanning non-WF1 auth tables");
}

function printSummary(report, reportPath) {
	console.log("");
	console.log("WF1 DB certification report:");
	console.log(`  ${reportPath}`);

	console.log("");
	console.log("Row counts:");
	console.table(report.rowCounts);

	console.log("");
	console.log("Lane summary:");
	console.log(JSON.stringify(report.lanes, null, 2));

	console.log("");
	console.log("WF1 identity evidence:");
	console.log(JSON.stringify(report.identityEvidence, null, 2));

	if (report.warnings.length > 0) {
		console.log("");
		console.log("Warnings:");
		for (const warning of report.warnings) {
			console.log(`  ! ${warning.message}`);
			if (warning.detail) {
				console.log(`    ${JSON.stringify(warning.detail)}`);
			}
		}
	}

	if (report.errors.length > 0) {
		console.log("");
		console.log("Errors:");
		for (const error of report.errors) {
			console.log(`  ✗ ${error.message}`);
			if (error.detail) {
				console.log(`    ${JSON.stringify(error.detail)}`);
			}
		}
	}
}

function main() {
	if (!fs.existsSync(SEED_PATH)) {
		fail(`Seed file not found: ${SEED_PATH}`);
	}

	const seed = JSON.parse(fs.readFileSync(SEED_PATH, "utf8"));

	const report = {
		generatedAt: new Date().toISOString(),
		dbName: DB_NAME,
		seedPath: SEED_PATH,
		allowEmpty: ALLOW_EMPTY,
		tables: {},
		rowCounts: {},
		lanes: {},
		userIdsSeenInWf1: [],
		identityEvidence: {},
		warnings: [],
		errors: [],
	};

	fs.mkdirSync(REPORT_DIR, { recursive: true });

	certifySchema(seed, report);
	const rows = certifyData(report);
	collectWf1IdentityEvidence(rows, report);

	const reportPath = path.join(REPORT_DIR, `wf1-db-certification-${Date.now()}.json`);
	fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

	printSummary(report, reportPath);

	if (report.errors.length > 0) {
		fail(`WF1 DB certification failed with ${report.errors.length} error(s).`);
	}

	console.log("");
	console.log("SUCCESS: WF1 remote D1 schema, lane separation, and workflow references are certified.");
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