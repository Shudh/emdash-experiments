import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
	expect,
	request as playwrightRequest,
	test,
	type APIRequestContext,
	type APIResponse,
} from "@playwright/test";

import { RENTAL_LOCAL_USERS } from "../rental-local-users.js";

const BASE_URL = "http://localhost:4450";
const OUT_FILE = join(process.cwd(), "test-results", "wf-express-interest-debug.json");

const JSON_HEADERS = {
	"Content-Type": "application/json",
	"X-EmDash-Request": "1",
};

type JsonRecord = Record<string, unknown>;

type ApiResult = {
	status: number;
	ok: boolean;
	url: string;
	body: unknown;
	text: string;
	headers: Record<string, string>;
};

type ActorApi = {
	email: string;
	api: APIRequestContext;
	user: JsonRecord | null;
	me: ApiResult;
};

function asRecord(value: unknown): JsonRecord {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asArray(value: unknown): unknown[] {
	return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	return "";
}

function getPath(value: unknown, path: string): unknown {
	let current: unknown = value;

	for (const part of path.split(".")) {
		if (!part) continue;
		if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
		current = (current as JsonRecord)[part];
	}

	return current;
}

function lastPathSegment(pathOrUrl: unknown): string {
	const text = asString(pathOrUrl);
	if (!text) return "";

	try {
		const url = text.startsWith("http") ? new URL(text) : new URL(text, BASE_URL);
		const parts = url.pathname.split("/").filter(Boolean);
		return parts.at(-1) ?? "";
	} catch {
		const parts = text.split("?")[0].split("/").filter(Boolean);
		return parts.at(-1) ?? "";
	}
}

function collectKeyPaths(
	value: unknown,
	keyToFind: string,
	prefix = "payload",
	output: Array<{ path: string; value: string }> = [],
): Array<{ path: string; value: string }> {
	if (!value || typeof value !== "object") return output;

	if (Array.isArray(value)) {
		value.forEach((item, index) => {
			collectKeyPaths(item, keyToFind, `${prefix}[${index}]`, output);
		});
		return output;
	}

	for (const [key, child] of Object.entries(value as JsonRecord)) {
		const path = `${prefix}.${key}`;

		if (key === keyToFind) {
			output.push({ path, value: asString(child) });
		}

		if (child && typeof child === "object") {
			collectKeyPaths(child, keyToFind, path, output);
		}
	}

	return output;
}

function firstRecursiveKey(value: unknown, keyToFind: string): { path: string; value: string } | null {
	return collectKeyPaths(value, keyToFind)[0] ?? null;
}

function uniqueCandidates(
	candidates: Array<{ label: string; id: string }>,
): Array<{ label: string; id: string }> {
	const seen = new Set<string>();
	const output: Array<{ label: string; id: string }> = [];

	for (const candidate of candidates) {
		if (!candidate.id) continue;
		const key = `${candidate.label}:${candidate.id}`;
		if (seen.has(key)) continue;
		seen.add(key);
		output.push(candidate);
	}

	return output;
}

async function readApiResponse(response: APIResponse): Promise<ApiResult> {
	const text = await response.text();
	let body: unknown = text;

	try {
		body = text ? JSON.parse(text) : null;
	} catch {
		body = text;
	}

	return {
		status: response.status(),
		ok: response.ok(),
		url: response.url(),
		body,
		text,
		headers: response.headers(),
	};
}

async function getJson(api: APIRequestContext, path: string): Promise<ApiResult> {
	return readApiResponse(await api.get(path, { headers: { Accept: "application/json" } }));
}

async function postJson(
	api: APIRequestContext,
	path: string,
	body: JsonRecord = {},
): Promise<ApiResult> {
	return readApiResponse(
		await api.post(path, {
			headers: JSON_HEADERS,
			data: body,
		}),
	);
}

async function loginAs(email: string): Promise<ActorApi> {
	const api = await playwrightRequest.newContext({
		baseURL: BASE_URL,
		extraHTTPHeaders: {
			Accept: "application/json",
		},
	});

	await api.get("/wf");

	const login = await postJson(api, "/api/setup/dev-login-as", { email });

	if (!login.ok) {
		throw new Error(`Login failed for ${email}: ${JSON.stringify(login, null, 2)}`);
	}

	const user = asRecord(asRecord(login.body).data).user;
	const me = await getJson(api, "/_emdash/api/auth/me");

	return {
		email,
		api,
		user: user && typeof user === "object" ? (user as JsonRecord) : null,
		me,
	};
}

async function requireOk(result: ApiResult, label: string): Promise<JsonRecord> {
	if (!result.ok) {
		throw new Error(`${label} failed: ${JSON.stringify(result, null, 2)}`);
	}

	const data = asRecord(asRecord(result.body).data);

	if (!Object.keys(data).length) {
		throw new Error(`${label} returned no data: ${JSON.stringify(result, null, 2)}`);
	}

	return data;
}

async function inspectWorkspace(
	api: APIRequestContext,
	candidate: { label: string; id: string },
): Promise<JsonRecord> {
	const result = await getJson(api, `/api/wf-rental/interests/${candidate.id}/workspace`);
	const data = asRecord(asRecord(result.body).data);
	const projection = asRecord(data.projection);
	const stage = asRecord(projection.stage);

	const cards = asArray(data.cards).map((card) => {
		const record = asRecord(card);
		return {
			id: record.id,
			card_type: record.card_type,
			card_state: record.card_state,
			created_by_role: record.created_by_role,
			prompt: record.prompt,
			card_spec: record.card_spec,
		};
	});

	return {
		label: candidate.label,
		id: candidate.id,
		status: result.status,
		ok: result.ok,
		error: asRecord(result.body).error ?? null,
		viewerRole: data.viewerRole ?? null,
		assetId: asRecord(data.asset).id ?? null,
		interestId: asRecord(data.interest).id ?? null,
		instanceId: asRecord(data.instance).id ?? null,
		workflowState: asRecord(data.instance).workflow_state ?? null,
		stage,
		cardCount: cards.length,
		cards,
		bodyKeys: Object.keys(asRecord(result.body)),
		dataKeys: Object.keys(data),
	};
}

test("debug workflow express-interest redirect and workspace ids without UI", async () => {
	test.setTimeout(120_000);

	const debug: JsonRecord = {
		baseUrl: BASE_URL,
		startedAt: new Date().toISOString(),
		steps: {},
	};

	const owner = await loginAs(RENTAL_LOCAL_USERS.owner.email);
	const tenant = await loginAs(RENTAL_LOCAL_USERS.tenant.email);

	try {
		debug.owner = {
			email: owner.email,
			user: owner.user,
			me: owner.me,
		};
		debug.tenant = {
			email: tenant.email,
			user: tenant.user,
			me: tenant.me,
		};

		const title = `WF Debug Redirect ${Date.now()}`;

		const addAsset = await postJson(owner.api, "/api/wf-rental/owner/assets/add", {
			assetKind: "flat",
			title,
			locationLabel: "Bangalore",
			publicPrice: 60000,
			currency: "INR",
			ownerConditionsSpec: {
				depositPolicy: "Two months deposit covers chargeable damage.",
				documentsRequired: ["company_id", "salary_slip"],
			},
		});

		debug.steps = {
			...asRecord(debug.steps),
			addAsset,
		};

		const addAssetData = await requireOk(addAsset, "addAsset");
		const asset = asRecord(addAssetData.asset);
		const assetId = asString(asset.id);

		const updateConfig = await postJson(owner.api, `/api/wf-rental/owner/assets/${assetId}/config`, {
			publicPrice: 60000,
			minimumMonths: 11,
			configSpec: {
				bedrooms: 2,
				furnishing: "semi_furnished",
			},
			conditionSpec: {
				walls: "freshly_painted",
			},
			ownerConditionsSpec: {
				depositPolicy: "Two months deposit covers chargeable damage.",
				documentsRequired: ["company_id", "salary_slip"],
			},
			items: [
				{
					itemKind: "fixture",
					itemLabel: "Door",
					ownerDeclaredState: "good",
					itemSpec: {
						notes: "Debug item",
					},
				},
			],
		});

		debug.steps = {
			...asRecord(debug.steps),
			updateConfig,
		};

		await requireOk(updateConfig, "updateConfig");

		const publish = await postJson(
			owner.api,
			`/api/wf-rental/owner/assets/${assetId}/publish-to-marketplace`,
			{},
		);

		debug.steps = {
			...asRecord(debug.steps),
			publish,
		};

		await requireOk(publish, "publish");

		const tenantDetails = await getJson(tenant.api, `/api/wf-rental/marketplace/assets/${assetId}`);

		debug.steps = {
			...asRecord(debug.steps),
			tenantDetails,
		};

		const tenantDetailsData = await requireOk(tenantDetails, "tenantDetails");
		const ownerConditions = asRecord(tenantDetailsData.ownerConditions);

		const interestMessage = "Please take me please";
		const expressInterest = await postJson(
			tenant.api,
			`/api/wf-rental/marketplace/assets/${assetId}/express-interest`,
			{
				name: "Tenant Manual Created 1",
				officialEmail: "tenant_manual_created_1@company.example.com",
				employerName: "Manual Company",
				offeredPrice: 59000,
				message: interestMessage,
				acceptedConditionsVersion: ownerConditions.version,
				acceptedConditionsHash: ownerConditions.hash,
			},
		);

		debug.steps = {
			...asRecord(debug.steps),
			expressInterest,
		};

		const expressData = await requireOk(expressInterest, "expressInterest");

		const directInterestId = asString(getPath(expressData, "interest.id"));
		const directAssetId = asString(getPath(expressData, "asset.id"));
		const directInstanceId = asString(getPath(expressData, "instance.id"));
		const explicitInterestId = asString(expressData.interestId);
		const workflowInstanceId = asString(expressData.workflowInstanceId);
		const redirectTo = asString(expressData.redirectTo);

		const firstId = firstRecursiveKey(expressData, "id");
		const firstInterestId = firstRecursiveKey(expressData, "interestId");

		debug.redirectAnalysis = {
			title,
			assetId,
			directAssetId,
			directInterestId,
			directInstanceId,
			explicitInterestId,
			workflowInstanceId,
			redirectTo,
			redirectToLastSegment: lastPathSegment(redirectTo),
			firstRecursiveId: firstId,
			firstRecursiveInterestId: firstInterestId,
			allIdPaths: collectKeyPaths(expressData, "id"),
			allInterestIdPaths: collectKeyPaths(expressData, "interestId"),
			oldTemplateSlashIdWouldGoTo: firstId ? `/wf/interests/${firstId.value}` : null,
			newTemplateInterestIdWouldGoTo: firstInterestId ? `/wf/interests/${firstInterestId.value}` : null,
			redirectToWouldGoTo: redirectTo || null,
			interestMessage,
		};

		const candidates = uniqueCandidates([
			{ label: "data.interest.id", id: directInterestId },
			{ label: "data.interestId", id: explicitInterestId },
			{ label: "redirectTo.lastSegment", id: lastPathSegment(redirectTo) },
			{ label: "firstRecursive interestId", id: firstInterestId?.value ?? "" },
			{ label: "firstRecursive id", id: firstId?.value ?? "" },
			{ label: "data.asset.id", id: directAssetId },
			{ label: "data.instance.id", id: directInstanceId },
			{ label: "data.workflowInstanceId", id: workflowInstanceId },
		]);

		debug.workspaceCandidatesAsTenant = [];
		for (const candidate of candidates) {
			asArray(debug.workspaceCandidatesAsTenant).push(await inspectWorkspace(tenant.api, candidate));
		}

		debug.workspaceCandidatesAsOwner = [];
		for (const candidate of candidates) {
			asArray(debug.workspaceCandidatesAsOwner).push(await inspectWorkspace(owner.api, candidate));
		}

		const ownerDashboard = await getJson(owner.api, "/api/wf-rental/owner/dashboard");
		debug.ownerDashboard = {
			status: ownerDashboard.status,
			ok: ownerDashboard.ok,
			inbox: asArray(asRecord(asRecord(ownerDashboard.body).data).inbox).map((item) => {
				const row = asRecord(item);
				return {
					id: row.id,
					asset_id: row.asset_id,
					asset_title: row.asset_title,
					workflow_instance_id: row.workflow_instance_id,
					interest_state: row.interest_state,
					message: row.message,
					pending_request_count: row.pending_request_count,
				};
			}),
		};

		mkdirSync(dirname(OUT_FILE), { recursive: true });
		writeFileSync(OUT_FILE, JSON.stringify(debug, null, 2));

		console.log(`\nWF express-interest debug report written to:\n${OUT_FILE}\n`);
		console.log("Redirect analysis:");
		console.log(JSON.stringify(debug.redirectAnalysis, null, 2));

		const tenantWorkspaceByInterest = asArray(debug.workspaceCandidatesAsTenant).find((entry) => {
			const row = asRecord(entry);
			return row.label === "data.interest.id";
		});

		expect(directInterestId).toMatch(/^wf_asset_interests_/);
		expect(asRecord(tenantWorkspaceByInterest).ok).toBe(true);
		expect(JSON.stringify(tenantWorkspaceByInterest)).toContain("application_submission");
		expect(JSON.stringify(tenantWorkspaceByInterest)).toContain(interestMessage);
	} finally {
		await owner.api.dispose();
		await tenant.api.dispose();
	}
});