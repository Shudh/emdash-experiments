import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const DB_NAME = process.env.HN_D1_DB_NAME || "handovernow_cms";
const REPORT_DIR = process.env.HN_WF1_TIMELINE_REPORT_DIR || "tmp/wf1-r	elationship-timelines";

const DEFAULT_APPLICANT_EMAIL = process.env.HN_WF1_APPLICANT_EMAIL || "";
const DEFAULT_OWNER_EMAIL = process.env.HN_WF1_OWNER_EMAIL || "";
const ASSET_ID = process.env.HN_WF1_ASSET_ID || "";
const NON_INTERACTIVE = process.argv.includes("--no-prompt");

function fail(message) {
	throw new Error(message);
}

function quoteIdent(value) {
	return `"${String(value).replaceAll('"', '""')}"`;
}

function sqlString(value) {
	return `'${String(value).replaceAll("'", "''")}'`;
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

function collectRows(value, rows = []) {
	if (Array.isArray(value)) {
		for (const item of value) collectRows(item, rows);
		return rows;
	}

	if (value && typeof value === "object") {
		if (Array.isArray(value.results)) {
			rows.push(...value.results);
			return rows;
		}

		for (const nested of Object.values(value)) collectRows(nested, rows);
	}

	return rows;
}

function queryRows(sql) {
	return collectRows(runSql(sql));
}

function safeJson(value) {
	if (!value) return {};
	if (typeof value === "object" && !Array.isArray(value)) return value;
	if (typeof value !== "string") return {};

	try {
		const parsed = JSON.parse(value);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

function safeArray(value) {
	return Array.isArray(value) ? value : [];
}

function stringValue(value, fallback = "") {
	if (typeof value === "string" && value.trim() !== "") return value.trim();
	if (typeof value === "number" && Number.isFinite(value)) return String(value);
	return fallback;
}

function dateLabel(value) {
	const raw = stringValue(value);
	if (!raw) return "";

	const date = new Date(raw);
	if (Number.isNaN(date.getTime())) return raw;

	return new Intl.DateTimeFormat("en-IN", {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone: "Asia/Kolkata",
	}).format(date);
}

function isTestLaneAsset(asset) {
	const configSpec = safeJson(asset.config_spec);
	const testLane = safeJson(configSpec.testLane);
	return testLane.enabled === true || testLane.enabled === 1;
}

function laneLabel(asset) {
	return isTestLaneAsset(asset) ? "test-corridor" : "public";
}

function compactId(id) {
	const value = stringValue(id);
	if (value.length <= 18) return value;
	return `${value.slice(0, 12)}…${value.slice(-6)}`;
}

function markdownJson(value) {
	return "```json\n" + JSON.stringify(value, null, 2) + "\n```";
}

function timelineSort(left, right) {
	const leftTime = Date.parse(stringValue(left.at));
	const rightTime = Date.parse(stringValue(right.at));
	const safeLeft = Number.isFinite(leftTime) ? leftTime : 0;
	const safeRight = Number.isFinite(rightTime) ? rightTime : 0;

	if (safeLeft !== safeRight) return safeLeft - safeRight;
	return stringValue(left.id).localeCompare(stringValue(right.id));
}

function listAssets() {
	const assets = queryRows(`
		SELECT *
		FROM ec_wf_assets
		WHERE deleted_at IS NULL
		ORDER BY created_at DESC, id DESC
		LIMIT 100;
	`);

	const assetIds = assets.map((asset) => stringValue(asset.id));

	const interests = assetIds.length === 0
		? []
		: queryRows(`
			SELECT asset_id, COUNT(*) AS count
			FROM ec_wf_asset_interests
			WHERE deleted_at IS NULL
			AND asset_id IN (${assetIds.map(sqlString).join(", ")})
			GROUP BY asset_id;
		`);

	const instances = assetIds.length === 0
		? []
		: queryRows(`
			SELECT asset_id, COUNT(*) AS count
			FROM ec_wf_workflow_instances
			WHERE deleted_at IS NULL
			AND asset_id IN (${assetIds.map(sqlString).join(", ")})
			GROUP BY asset_id;
		`);

	const cards = assetIds.length === 0
		? []
		: queryRows(`
			SELECT asset_id, COUNT(*) AS count
			FROM ec_wf_workflow_cards
			WHERE deleted_at IS NULL
			AND asset_id IN (${assetIds.map(sqlString).join(", ")})
			GROUP BY asset_id;
		`);

	const responses = assetIds.length === 0
		? []
		: queryRows(`
			SELECT asset_id, COUNT(*) AS count
			FROM ec_wf_workflow_card_responses
			WHERE deleted_at IS NULL
			AND asset_id IN (${assetIds.map(sqlString).join(", ")})
			GROUP BY asset_id;
		`);

	const events = assetIds.length === 0
		? []
		: queryRows(`
			SELECT asset_id, COUNT(*) AS count
			FROM ec_wf_asset_events
			WHERE deleted_at IS NULL
			AND asset_id IN (${assetIds.map(sqlString).join(", ")})
			GROUP BY asset_id;
		`);

	const countMap = (rows) => new Map(rows.map((row) => [stringValue(row.asset_id), Number(row.count ?? 0)]));

	const interestCounts = countMap(interests);
	const instanceCounts = countMap(instances);
	const cardCounts = countMap(cards);
	const responseCounts = countMap(responses);
	const eventCounts = countMap(events);

	return assets.map((asset, index) => ({
		index: index + 1,
		id: stringValue(asset.id),
		title: stringValue(asset.title, "(untitled)"),
		lane: laneLabel(asset),
		status: stringValue(asset.status),
		businessState: stringValue(asset.business_state),
		visibilityState: stringValue(asset.visibility_state),
		ownerUserId: stringValue(asset.owner_user_id),
		activeInterestId: stringValue(asset.active_interest_id),
		activeWorkflowInstanceId: stringValue(asset.active_workflow_instance_id),
		activeRenterUserId: stringValue(asset.active_renter_user_id),
		createdAt: stringValue(asset.created_at),
		publishedAt: stringValue(asset.published_at),
		interestCount: interestCounts.get(stringValue(asset.id)) ?? 0,
		workflowInstanceCount: instanceCounts.get(stringValue(asset.id)) ?? 0,
		cardCount: cardCounts.get(stringValue(asset.id)) ?? 0,
		responseCount: responseCounts.get(stringValue(asset.id)) ?? 0,
		eventCount: eventCounts.get(stringValue(asset.id)) ?? 0,
		raw: asset,
	}));
}

function printAssetList(assetSummaries) {
	console.log("");
	console.log("WF1 assets");
	console.log("");

	for (const asset of assetSummaries) {
		console.log(
			[
				`${asset.index}. ${asset.title}`,
				`   id: ${asset.id}`,
				`   lane: ${asset.lane}`,
				`   state: ${asset.businessState} / ${asset.visibilityState}`,
				`   owner_user_id: ${asset.ownerUserId}`,
				`   applicants/interests: ${asset.interestCount}`,
				`   workflows: ${asset.workflowInstanceCount}`,
				`   cards/responses/events: ${asset.cardCount}/${asset.responseCount}/${asset.eventCount}`,
				asset.activeInterestId ? `   active_interest_id: ${asset.activeInterestId}` : "",
				asset.activeWorkflowInstanceId ? `   active_workflow_instance_id: ${asset.activeWorkflowInstanceId}` : "",
				asset.activeRenterUserId ? `   active_renter_user_id: ${asset.activeRenterUserId}` : "",
			]
				.filter(Boolean)
				.join("\n"),
		);
		console.log("");
	}
}

async function chooseAsset(assetSummaries) {
	if (ASSET_ID) {
		const selected = assetSummaries.find((asset) => asset.id === ASSET_ID);
		if (!selected) fail(`HN_WF1_ASSET_ID was provided but not found in active assets: ${ASSET_ID}`);
		return selected;
	}

	if (assetSummaries.length === 0) fail("No WF1 assets found.");

	if (NON_INTERACTIVE) {
		return assetSummaries[0];
	}

	const rl = readline.createInterface({ input, output });

	try {
		const answer = await rl.question("Select asset number for relationship time-travel report: ");
		const index = Number(answer.trim());

		if (!Number.isInteger(index) || index < 1 || index > assetSummaries.length) {
			fail(`Invalid asset number: ${answer}`);
		}

		return assetSummaries[index - 1];
	} finally {
		rl.close();
	}
}

function loadAssetGraph(assetId) {
	const assetRows = queryRows(`
		SELECT *
		FROM ec_wf_assets
		WHERE id = ${sqlString(assetId)}
		AND deleted_at IS NULL
		LIMIT 1;
	`);

	const asset = assetRows[0] ?? null;
	if (!asset) fail(`Asset not found: ${assetId}`);

	const interests = queryRows(`
		SELECT *
		FROM ec_wf_asset_interests
		WHERE asset_id = ${sqlString(assetId)}
		AND deleted_at IS NULL
		ORDER BY created_at ASC, id ASC;
	`);

	const instances = queryRows(`
		SELECT *
		FROM ec_wf_workflow_instances
		WHERE asset_id = ${sqlString(assetId)}
		AND deleted_at IS NULL
		ORDER BY created_at ASC, id ASC;
	`);

	const cards = queryRows(`
		SELECT *
		FROM ec_wf_workflow_cards
		WHERE asset_id = ${sqlString(assetId)}
		AND deleted_at IS NULL
		ORDER BY created_at ASC, id ASC;
	`);

	const responses = queryRows(`
		SELECT *
		FROM ec_wf_workflow_card_responses
		WHERE asset_id = ${sqlString(assetId)}
		AND deleted_at IS NULL
		ORDER BY created_at ASC, id ASC;
	`);

	const evidenceAttachments = queryRows(`
		SELECT *
		FROM ec_wf_evidence_attachments
		WHERE asset_id = ${sqlString(assetId)}
		AND deleted_at IS NULL
		ORDER BY created_at ASC, id ASC;
	`);

	const assetAccess = queryRows(`
		SELECT *
		FROM ec_wf_asset_access
		WHERE asset_id = ${sqlString(assetId)}
		AND deleted_at IS NULL
		ORDER BY created_at ASC, id ASC;
	`);

	const events = queryRows(`
		SELECT *
		FROM ec_wf_asset_events
		WHERE asset_id = ${sqlString(assetId)}
		AND deleted_at IS NULL
		ORDER BY created_at ASC, id ASC;
	`);

	const configItems = queryRows(`
		SELECT *
		FROM ec_wf_asset_config_items
		WHERE asset_id = ${sqlString(assetId)}
		AND deleted_at IS NULL
		ORDER BY created_at ASC, id ASC;
	`);

	return {
		asset,
		interests,
		instances,
		cards,
		responses,
		evidenceAttachments,
		assetAccess,
		events,
		configItems,
	};
}

function applicantLabel(interest) {
	const name = stringValue(interest.name, "Applicant");
	const email = stringValue(interest.official_email);
	const phone = stringValue(interest.phone);
	const userId = stringValue(interest.interested_user_id);

	return [name, email, phone, userId ? `user:${compactId(userId)}` : ""].filter(Boolean).join(" · ");
}

function interestMatchesFilters(interest) {
	if (DEFAULT_APPLICANT_EMAIL) {
		return stringValue(interest.official_email).toLowerCase() === DEFAULT_APPLICANT_EMAIL.toLowerCase();
	}

	return true;
}

function groupBy(rows, keyFn) {
	const map = new Map();

	for (const row of rows) {
		const key = keyFn(row);
		if (!map.has(key)) map.set(key, []);
		map.get(key).push(row);
	}

	return map;
}

function buildRelationshipReports(graph) {
	const instancesByInterestId = groupBy(graph.instances, (row) => stringValue(row.interest_id));
	const cardsByInstanceId = groupBy(graph.cards, (row) => stringValue(row.workflow_instance_id));
	const responsesByCardId = groupBy(graph.responses, (row) => stringValue(row.card_id));
	const evidenceByCardId = groupBy(graph.evidenceAttachments, (row) => stringValue(row.card_id));
	const eventsByInterestId = groupBy(graph.events, (row) => stringValue(row.interest_id));
	const eventsByInstanceId = groupBy(graph.events, (row) => stringValue(row.workflow_instance_id));
	const eventsByCardId = groupBy(graph.events, (row) => stringValue(row.card_id));

	const reports = [];

	for (const interest of graph.interests.filter(interestMatchesFilters)) {
		const instances = instancesByInterestId.get(stringValue(interest.id)) ?? [];
		const prescreen = safeJson(safeJson(interest.interest_spec).prescreen);
		const prescreenAnswers = safeArray(prescreen.answers);

		const relationship = {
			interest,
			instances: [],
			prescreen: {
				kind: stringValue(prescreen.kind),
				version: prescreen.version ?? null,
				source: stringValue(prescreen.source),
				startedAt: stringValue(prescreen.startedAt),
				submittedAt: stringValue(prescreen.submittedAt),
				answerCount: prescreenAnswers.length,
				answers: prescreenAnswers,
			},
			timeline: [],
			counts: {
				instances: instances.length,
				cards: 0,
				responses: 0,
				evidenceAttachments: 0,
				events: 0,
			},
		};

		relationship.timeline.push({
			type: "interest",
			at: stringValue(interest.created_at),
			id: stringValue(interest.id),
			title: "Application / interest submitted",
			actorUserId: stringValue(interest.interested_user_id),
			actorRole: "applicant",
			summary: `${applicantLabel(interest)} expressed interest.`,
			raw: interest,
		});

		if (prescreenAnswers.length > 0) {
			relationship.timeline.push({
				type: "prescreen",
				at: stringValue(prescreen.submittedAt || interest.created_at),
				id: `${interest.id}:prescreen`,
				title: "ChatBotify screening submitted",
				actorUserId: stringValue(interest.interested_user_id),
				actorRole: "applicant",
				summary: `${prescreenAnswers.length} screening answers captured from ChatBotify.`,
				raw: prescreen,
			});
		}

		for (const instance of instances) {
			const instanceCards = cardsByInstanceId.get(stringValue(instance.id)) ?? [];
			const instanceEvents = eventsByInstanceId.get(stringValue(instance.id)) ?? [];
			const interestEvents = eventsByInterestId.get(stringValue(interest.id)) ?? [];

			const instanceReport = {
				instance,
				cards: [],
				events: instanceEvents,
			};

			relationship.timeline.push({
				type: "workflow_instance",
				at: stringValue(instance.created_at),
				id: stringValue(instance.id),
				title: "Workflow instance created",
				actorUserId: stringValue(instance.applicant_user_id),
				actorRole: "applicant",
				summary: `Workflow state: ${stringValue(instance.workflow_state)}. Definition: ${stringValue(instance.definition_id)}@${stringValue(instance.definition_version)}.`,
				raw: instance,
			});

			for (const event of interestEvents) {
				relationship.timeline.push({
					type: "event",
					at: stringValue(event.created_at),
					id: stringValue(event.id),
					title: stringValue(event.event_kind, "event"),
					actorUserId: stringValue(event.actor_user_id),
					actorRole: stringValue(event.actor_role),
					summary: eventSummary(event),
					raw: event,
				});
			}

			for (const card of instanceCards) {
				const cardResponses = responsesByCardId.get(stringValue(card.id)) ?? [];
				const cardEvidence = evidenceByCardId.get(stringValue(card.id)) ?? [];
				const cardEvents = eventsByCardId.get(stringValue(card.id)) ?? [];

				relationship.counts.cards += 1;
				relationship.counts.responses += cardResponses.length;
				relationship.counts.evidenceAttachments += cardEvidence.length;

				instanceReport.cards.push({
					card,
					responses: cardResponses,
					evidenceAttachments: cardEvidence,
					events: cardEvents,
				});

				relationship.timeline.push({
					type: "card",
					at: stringValue(card.created_at),
					id: stringValue(card.id),
					title: `Card created: ${stringValue(card.card_type)}`,
					actorUserId: stringValue(card.created_by_user_id),
					actorRole: stringValue(card.created_by_role),
					summary: `${stringValue(card.created_by_role)} created ${stringValue(card.card_type)} card. State: ${stringValue(card.card_state)}. Prompt: ${stringValue(card.prompt).slice(0, 180)}`,
					raw: card,
				});

				for (const response of cardResponses) {
					relationship.timeline.push({
						type: "response",
						at: stringValue(response.created_at),
						id: stringValue(response.id),
						title: "Card answered",
						actorUserId: stringValue(response.responded_by_user_id),
						actorRole: stringValue(response.responded_by_role),
						summary: `${stringValue(response.responded_by_role)} answered card ${compactId(response.card_id)}. Answer: ${answerSummary(response.answer_value)}`,
						raw: response,
					});
				}

				for (const evidence of cardEvidence) {
					relationship.timeline.push({
						type: "evidence",
						at: stringValue(evidence.created_at),
						id: stringValue(evidence.id),
						title: "Evidence attached",
						actorUserId: stringValue(evidence.applicant_user_id || evidence.owner_user_id),
						actorRole: stringValue(evidence.applicant_user_id) ? "applicant" : "owner",
						summary: `${stringValue(evidence.attachment_label, "Evidence")} · ${stringValue(evidence.mime_type)} · ${stringValue(evidence.storage_key)}`,
						raw: evidence,
					});
				}

				for (const event of cardEvents) {
					relationship.timeline.push({
						type: "event",
						at: stringValue(event.created_at),
						id: stringValue(event.id),
						title: stringValue(event.event_kind, "event"),
						actorUserId: stringValue(event.actor_user_id),
						actorRole: stringValue(event.actor_role),
						summary: eventSummary(event),
						raw: event,
					});
				}
			}

			relationship.instances.push(instanceReport);
		}

		relationship.timeline.sort(timelineSort);
		relationship.counts.events = relationship.timeline.filter((item) => item.type === "event").length;

		reports.push(relationship);
	}

	return reports;
}

function answerSummary(value) {
	const parsed = safeJson(value);

	if (Object.keys(parsed).length > 0) {
		return JSON.stringify(parsed).slice(0, 220);
	}

	return stringValue(value, "(empty)").slice(0, 220);
}

function eventSummary(event) {
	const fromWorkflow = stringValue(event.from_workflow_state);
	const toWorkflow = stringValue(event.to_workflow_state);
	const fromAsset = stringValue(event.from_asset_state);
	const toAsset = stringValue(event.to_asset_state);
	const parts = [];

	if (fromWorkflow || toWorkflow) parts.push(`workflow ${fromWorkflow || "∅"} → ${toWorkflow || "∅"}`);
	if (fromAsset || toAsset) parts.push(`asset ${fromAsset || "∅"} → ${toAsset || "∅"}`);

	const eventSpec = safeJson(event.event_spec);
	const message = stringValue(eventSpec.message);

	if (message) parts.push(`message: ${message}`);

	return parts.length > 0 ? parts.join("; ") : stringValue(event.event_kind, "event");
}

function buildReport(graph, relationshipReports) {
	return {
		generatedAt: new Date().toISOString(),
		dbName: DB_NAME,
		filters: {
			assetId: stringValue(graph.asset.id),
			applicantEmail: DEFAULT_APPLICANT_EMAIL || null,
			ownerEmail: DEFAULT_OWNER_EMAIL || null,
		},
		asset: graph.asset,
		lane: laneLabel(graph.asset),
		configItems: graph.configItems,
		assetAccess: graph.assetAccess,
		counts: {
			interests: graph.interests.length,
			workflowInstances: graph.instances.length,
			workflowCards: graph.cards.length,
			workflowCardResponses: graph.responses.length,
			evidenceAttachments: graph.evidenceAttachments.length,
			assetEvents: graph.events.length,
			assetAccess: graph.assetAccess.length,
			assetConfigItems: graph.configItems.length,
			relationshipReports: relationshipReports.length,
		},
		relationships: relationshipReports,
	};
}

function buildMarkdownReport(report) {
	const lines = [];

	lines.push(`# WF1 asset relationship time-travel report`);
	lines.push("");
	lines.push(`Generated: ${report.generatedAt}`);
	lines.push(`DB: ${report.dbName}`);
	lines.push("");
	lines.push(`## Asset`);
	lines.push("");
	lines.push(`- Title: ${stringValue(report.asset.title)}`);
	lines.push(`- Asset id: \`${stringValue(report.asset.id)}\``);
	lines.push(`- Lane: **${report.lane}**`);
	lines.push(`- Status: ${stringValue(report.asset.status)}`);
	lines.push(`- Business state: ${stringValue(report.asset.business_state)}`);
	lines.push(`- Visibility state: ${stringValue(report.asset.visibility_state)}`);
	lines.push(`- Owner user id: \`${stringValue(report.asset.owner_user_id)}\``);
	lines.push(`- Active interest id: \`${stringValue(report.asset.active_interest_id, "none")}\``);
	lines.push(`- Active workflow instance id: \`${stringValue(report.asset.active_workflow_instance_id, "none")}\``);
	lines.push(`- Active renter user id: \`${stringValue(report.asset.active_renter_user_id, "none")}\``);
	lines.push("");
	lines.push(`## Counts`);
	lines.push("");
	for (const [key, count] of Object.entries(report.counts)) {
		lines.push(`- ${key}: ${count}`);
	}
	lines.push("");

	if (report.relationships.length === 0) {
		lines.push("## Relationships");
		lines.push("");
		lines.push("No matching applicant/tenant relationship found for this asset and filters.");
		lines.push("");
		return lines.join("\n");
	}

	for (const relationship of report.relationships) {
		const interest = relationship.interest;

		lines.push(`## Relationship: ${applicantLabel(interest)}`);
		lines.push("");
		lines.push(`- Interest id: \`${stringValue(interest.id)}\``);
		lines.push(`- Interest state: ${stringValue(interest.interest_state)}`);
		lines.push(`- Applicant user id: \`${stringValue(interest.interested_user_id)}\``);
		lines.push(`- Workflow instance id on interest: \`${stringValue(interest.workflow_instance_id, "none")}\``);
		lines.push(`- Submitted: ${dateLabel(interest.created_at)}`);
		lines.push(`- Screening answers: ${relationship.prescreen.answerCount}`);
		lines.push(`- Workflow instances: ${relationship.counts.instances}`);
		lines.push(`- Cards: ${relationship.counts.cards}`);
		lines.push(`- Responses: ${relationship.counts.responses}`);
		lines.push(`- Evidence attachments: ${relationship.counts.evidenceAttachments}`);
		lines.push("");

		if (relationship.prescreen.answerCount > 0) {
			lines.push(`### ChatBotify screening answers`);
			lines.push("");
			for (const answer of relationship.prescreen.answers) {
				lines.push(`- **${stringValue(answer.label, answer.key)}**`);
				lines.push(`  - answer: ${stringValue(answer.answer, "(blank)")}`);
				if (stringValue(answer.target)) lines.push(`  - target: \`${stringValue(answer.target)}\``);
			}
			lines.push("");
		}

		lines.push(`### Time travel`);
		lines.push("");
		for (let index = 0; index < relationship.timeline.length; index += 1) {
			const item = relationship.timeline[index];
			lines.push(`${index + 1}. **${item.title}**`);
			lines.push(`   - when: ${dateLabel(item.at)}`);
			lines.push(`   - type: ${item.type}`);
			lines.push(`   - id: \`${item.id}\``);
			if (item.actorRole) lines.push(`   - actor role: ${item.actorRole}`);
			if (item.actorUserId) lines.push(`   - actor user id: \`${item.actorUserId}\``);
			lines.push(`   - summary: ${item.summary}`);
		}
		lines.push("");
	}

	lines.push(`## Raw relationship JSON`);
	lines.push("");
	lines.push(markdownJson(report.relationships));

	return lines.join("\n");
}

function writeReports(report) {
	fs.mkdirSync(REPORT_DIR, { recursive: true });

	const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
	const assetId = stringValue(report.asset.id).replaceAll(/[^a-zA-Z0-9_-]/g, "_");
	const basename = `wf1-relationship-timeline-${assetId}-${stamp}`;
	const jsonPath = path.join(REPORT_DIR, `${basename}.json`);
	const mdPath = path.join(REPORT_DIR, `${basename}.md`);

	fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
	fs.writeFileSync(mdPath, buildMarkdownReport(report));

	return { jsonPath, mdPath };
}

async function main() {
	const assetSummaries = listAssets();
	printAssetList(assetSummaries);

	const selected = await chooseAsset(assetSummaries);

	console.log("");
	console.log(`Selected asset: ${selected.title}`);
	console.log(`Asset id: ${selected.id}`);
	console.log("");

	const graph = loadAssetGraph(selected.id);
	const relationshipReports = buildRelationshipReports(graph);
	const report = buildReport(graph, relationshipReports);
	const paths = writeReports(report);

	console.log("Relationship report written:");
	console.log(`  Markdown: ${paths.mdPath}`);
	console.log(`  JSON:     ${paths.jsonPath}`);
	console.log("");
	console.log("Summary:");
	console.table(report.counts);

	if (relationshipReports.length > 0) {
		console.log("");
		console.log("Relationships found:");
		for (let index = 0; index < relationshipReports.length; index += 1) {
			const relationship = relationshipReports[index];
			console.log(
				`${index + 1}. ${applicantLabel(relationship.interest)} | cards=${relationship.counts.cards}, responses=${relationship.counts.responses}, screeningAnswers=${relationship.prescreen.answerCount}`,
			);
		}
	} else {
		console.log("No matching relationship found.");
	}

	console.log("");
	console.log("This script is read-only. No rows were changed.");
}

main().catch((error) => {
	console.error("");
	console.error("FAILED");
	console.error(error instanceof Error ? error.message : error);
	console.error("");
	process.exitCode = 1;
});