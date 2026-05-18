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
const OUT_FILE = join(process.cwd(), "test-results", "wf-owner-actions-debug.json");

const JSON_HEADERS = {
	"Content-Type": "application/json",
	"X-EmDash-Request": "1",
};

type JsonRecord = Record<string, unknown>;

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

async function readApiResponse(response: APIResponse) {
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

async function postJson(api: APIRequestContext, path: string, body: JsonRecord = {}) {
	return readApiResponse(
		await api.post(path, {
			headers: JSON_HEADERS,
			data: body,
		}),
	);
}

async function getJson(api: APIRequestContext, path: string) {
	return readApiResponse(
		await api.get(path, {
			headers: {
				Accept: "application/json",
			},
		}),
	);
}

async function loginAs(email: string) {
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

	return api;
}

function dataOf(result: Awaited<ReturnType<typeof getJson>>): JsonRecord {
	const body = asRecord(result.body);
	return asRecord(body.data);
}

test("debug owner available actions after workflow interest submission", async () => {
	test.setTimeout(120_000);

	const debug: JsonRecord = {
		startedAt: new Date().toISOString(),
		baseUrl: BASE_URL,
	};

	const ownerApi = await loginAs(RENTAL_LOCAL_USERS.owner.email);
	const tenantApi = await loginAs(RENTAL_LOCAL_USERS.tenant.email);

	try {
		const title = `WF Owner Actions Debug ${Date.now()}`;

		const addAsset = await postJson(ownerApi, "/api/wf-rental/owner/assets/add", {
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

		const assetId = asString(dataOf(addAsset).asset && asRecord(dataOf(addAsset).asset).id);

		const updateConfig = await postJson(ownerApi, `/api/wf-rental/owner/assets/${assetId}/config`, {
			publicPrice: 60000,
			minimumMonths: 11,
			configSpec: { bedrooms: 2 },
			conditionSpec: { walls: "freshly_painted" },
			ownerConditionsSpec: {
				depositPolicy: "Two months deposit covers chargeable damage.",
				documentsRequired: ["company_id", "salary_slip"],
			},
			items: [
				{
					itemKind: "fixture",
					itemLabel: "Door",
					ownerDeclaredState: "good",
					itemSpec: { notes: "Debug item" },
				},
			],
		});

		const publish = await postJson(
			ownerApi,
			`/api/wf-rental/owner/assets/${assetId}/publish-to-marketplace`,
			{},
		);

		const details = await getJson(tenantApi, `/api/wf-rental/marketplace/assets/${assetId}`);
		const detailsData = dataOf(details);
		const ownerConditions = asRecord(detailsData.ownerConditions);

		const expressInterest = await postJson(
			tenantApi,
			`/api/wf-rental/marketplace/assets/${assetId}/express-interest`,
			{
				name: "Tenant Manual Created 1",
				officialEmail: "tenant_manual_created_1@company.example.com",
				employerName: "Manual Company",
				offeredPrice: 59000,
				message: "Please take me please",
				acceptedConditionsVersion: ownerConditions.version,
				acceptedConditionsHash: ownerConditions.hash,
			},
		);

		const expressData = dataOf(expressInterest);
		const interest = asRecord(expressData.interest);
		const interestId = asString(interest.id);

		const ownerWorkspaceResponse = await getJson(
			ownerApi,
			`/api/wf-rental/interests/${interestId}/workspace`,
		);
		const ownerWorkspace = dataOf(ownerWorkspaceResponse);
		const projection = asRecord(ownerWorkspace.projection);

		const availableActions = asArray(projection.availableActions).map((action) => {
			const row = asRecord(action);
			return {
				id: row.id,
				label: row.label,
				blocked: row.blocked,
				warnings: row.warnings,
				unresolvedCardPolicy: row.unresolvedCardPolicy,
			};
		});

		const availableCardTypes = asArray(projection.availableCardTypes).map((cardType) => {
			const row = asRecord(cardType);
			return {
				id: row.id,
				label: row.label,
			};
		});

		const cards = asArray(ownerWorkspace.cards).map((card) => {
			const row = asRecord(card);
			return {
				id: row.id,
				card_type: row.card_type,
				card_state: row.card_state,
				created_by_role: row.created_by_role,
				prompt: row.prompt,
				card_spec: row.card_spec,
			};
		});

		debug.steps = {
			addAsset,
			updateConfig,
			publish,
			details,
			expressInterest,
			ownerWorkspaceResponse,
		};

		debug.summary = {
			title,
			assetId,
			interestId,
			viewerRole: ownerWorkspace.viewerRole,
			workflowState: asRecord(ownerWorkspace.instance).workflow_state,
			assetState: asRecord(ownerWorkspace.asset).business_state,
			stage: projection.stage,
			availableActions,
			availableCardTypes,
			cards,
		};

		mkdirSync(dirname(OUT_FILE), { recursive: true });
		writeFileSync(OUT_FILE, JSON.stringify(debug, null, 2));

		console.log(`\nOwner actions debug report written to:\n${OUT_FILE}\n`);
		console.log(JSON.stringify(debug.summary, null, 2));

		expect(ownerWorkspaceResponse.ok).toBe(true);
		expect(ownerWorkspace.viewerRole).toBe("owner");
		expect(asString(asRecord(ownerWorkspace.instance).workflow_state)).toBe("submitted");
		expect(asString(asRecord(ownerWorkspace.asset).business_state)).toBe("listed");
		expect(JSON.stringify(cards)).toContain("application_submission");

		// This is the exact backend projection assertion.
		expect(availableActions.some((action) => action.id === "accept_applicant")).toBe(true);
	} finally {
		await ownerApi.dispose();
		await tenantApi.dispose();
	}
});