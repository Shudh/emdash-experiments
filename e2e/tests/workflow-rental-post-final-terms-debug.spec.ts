import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { expect, test, type APIResponse, type Page } from "@playwright/test";

import { RENTAL_LOCAL_USERS } from "../rental-local-users.js";
import {
	createWorkflowFlatThroughOwnerUi,
	loginAsWorkflowRentalUser,
	workflowMarketplaceAssetCard,
	uniqueWorkflowRentalTitle,
} from "../workflow-rental-flow-utils.js";

const OUT_FILE = join(process.cwd(), "test-results", "wf-post-final-terms-debug.json");
const OUT_HTML_FILE = join(process.cwd(), "test-results", "wf-post-final-terms-tenant.html");

type JsonRecord = Record<string, unknown>;

type ApiDump = {
	status: number;
	ok: boolean;
	url: string;
	body: unknown;
	text: string;
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

function getInterestIdFromUrl(urlText: string): string {
	const url = new URL(urlText);
	const parts = url.pathname.split("/").filter(Boolean);
	const interestId = parts.at(-1) ?? "";

	if (!interestId.startsWith("wf_asset_interests_")) {
		throw new Error(`Unexpected interest URL, cannot extract interest id: ${urlText}`);
	}

	return interestId;
}

async function readApiResponse(response: APIResponse): Promise<ApiDump> {
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
	};
}

function summarizeWorkspace(apiDump: ApiDump): JsonRecord {
	const data = asRecord(asRecord(apiDump.body).data);
	const projection = asRecord(data.projection);
	const stage = asRecord(projection.stage);
	const asset = asRecord(data.asset);
	const interest = asRecord(data.interest);
	const instance = asRecord(data.instance);

	const cards = asArray(data.cards).map((card) => {
		const record = asRecord(card);
		return {
			id: record.id,
			card_type: record.card_type,
			card_state: record.card_state,
			created_by_role: record.created_by_role,
			prompt: record.prompt,
			card_spec: record.card_spec,
			responses: asArray(record.responses).map((response) => {
				const responseRecord = asRecord(response);
				return {
					id: responseRecord.id,
					answer_value: responseRecord.answer_value,
					response_message: responseRecord.response_message,
					created_by_user_id: responseRecord.created_by_user_id,
					created_at: responseRecord.created_at,
				};
			}),
		};
	});

	return {
		status: apiDump.status,
		ok: apiDump.ok,
		viewerRole: data.viewerRole ?? null,
		asset: {
			id: asset.id,
			title: asset.title,
			asset_state: asset.asset_state,
			visibility_state: asset.visibility_state,
		},
		interest: {
			id: interest.id,
			interest_state: interest.interest_state,
			applicant_user_id: interest.applicant_user_id,
			owner_user_id: interest.owner_user_id,
		},
		instance: {
			id: instance.id,
			workflow_state: instance.workflow_state,
			definition_id: instance.definition_id,
			definition_version: instance.definition_version,
		},
		stage,
		cardCount: cards.length,
		cards,
		dataKeys: Object.keys(data),
	};
}

async function dumpVisiblePageState(page: Page): Promise<JsonRecord> {
	const bodyText = await page.locator("body").innerText();

	const headings = await page
		.locator("h1, h2, h3, h4")
		.evaluateAll((elements) =>
			elements.map((element) => ({
				tagName: element.tagName,
				text: element.textContent?.trim() ?? "",
			})),
		);

	const buttons = await page
		.locator("button")
		.evaluateAll((elements) =>
			elements.map((element) => ({
				text: element.textContent?.trim() ?? "",
				disabled: (element as HTMLButtonElement).disabled,
				type: (element as HTMLButtonElement).type,
			})),
		);

	const labels = await page
		.locator("label")
		.evaluateAll((elements) =>
			elements.map((element) => ({
				text: element.textContent?.trim() ?? "",
				forAttribute: element.getAttribute("for"),
			})),
		);

	const formsReady = await page.evaluate(
		() => (window as { __rentalFormsReady?: boolean }).__rentalFormsReady ?? null,
	);

	return {
		url: page.url(),
		formsReady,
		bodyText,
		bodyContainsNoActionNeededNow: bodyText.includes("No action needed now"),
		bodyContainsOwnerWillSendNextRequest: bodyText.includes("The owner will send the next request"),
		bodyContainsAgreementAccepted: bodyText.includes("Agreement accepted"),
		headings,
		buttons,
		labels,
	};
}

test("debug tenant workspace immediately after owner accepts final terms", async ({ browser }) => {
	test.setTimeout(120_000);

	const owner = await loginAsWorkflowRentalUser(browser, RENTAL_LOCAL_USERS.owner.email);
	const tenant = await loginAsWorkflowRentalUser(browser, RENTAL_LOCAL_USERS.tenant.email);

	const debug: JsonRecord = {
		startedAt: new Date().toISOString(),
		steps: [],
	};

	try {
		const title = uniqueWorkflowRentalTitle();
		const { assetUrl } = await createWorkflowFlatThroughOwnerUi(owner.page, title);

		debug.title = title;
		debug.assetUrl = assetUrl;

		await tenant.page.goto("/wf/marketplace", { waitUntil: "domcontentloaded" });
		const tenantAssetCard = workflowMarketplaceAssetCard(tenant.page, title);
		await expect(tenantAssetCard).toBeVisible();
		await tenantAssetCard.getByRole("link", { name: title }).click();
		await expect(tenant.page).toHaveURL(assetUrl);

		await tenant.page.waitForFunction(
			() => (window as { __rentalFormsReady?: boolean }).__rentalFormsReady === true,
		);

		await tenant.page.getByLabel("Name").fill("Tenant Manual Created 1");
		await tenant.page
			.getByLabel("Official email")
			.fill("tenant_manual_created_1@company.example.com");
		await tenant.page.getByLabel("Employer").fill("Manual Company");
		await tenant.page.getByLabel("Offer").fill("59000");
		await tenant.page.getByLabel("Message").fill("Please take me please");
		await tenant.page.getByLabel("I accept the current owner conditions.").check();
		await tenant.page.getByRole("button", { name: "Express interest" }).click();

		await expect(tenant.page).toHaveURL(/\/wf\/interests\/wf_asset_interests_[^/]+$/);
		const interestUrl = tenant.page.url();
		const interestId = getInterestIdFromUrl(interestUrl);

		debug.interestUrl = interestUrl;
		debug.interestId = interestId;

		await expect(tenant.page.getByText("Application submitted")).toBeVisible();
		await expect(tenant.page.getByText("Please take me please")).toBeVisible();

		await owner.page.goto("/wf/owner", { waitUntil: "domcontentloaded" });
		await expect(owner.page.getByRole("heading", { name: "Submitted interest inbox" })).toBeVisible();
		await owner.page.locator(".inbox-item").filter({ hasText: title }).click();
		await expect(owner.page).toHaveURL(interestUrl);

		await owner.page.waitForFunction(
			() => (window as { __rentalFormsReady?: boolean }).__rentalFormsReady === true,
		);

		await owner.page.getByLabel("Owner request").fill("Please upload company ID and salary slip.");
		await owner.page.getByRole("button", { name: "Create request card" }).click();
		await expect(owner.page.getByText("Please upload company ID and salary slip.")).toBeVisible();

		await tenant.page.goto(interestUrl, { waitUntil: "domcontentloaded" });
		await tenant.page.waitForFunction(
			() => (window as { __rentalFormsReady?: boolean }).__rentalFormsReady === true,
		);

		await expect(tenant.page.getByText("Your pending task cards")).toBeVisible();
		await expect(tenant.page.getByText("1 pending")).toBeVisible();
		await tenant.page.getByLabel("Answer").fill("Company ID and salary slip shared.");
		await tenant.page.getByRole("button", { name: "Answer" }).click();
		await expect(tenant.page.getByText("Company ID and salary slip shared.")).toBeVisible();

		await tenant.page.getByLabel("Offer message").fill("I can move in quickly if rent is reduced to 57000.");
		await tenant.page.getByRole("button", { name: "Send offer" }).click();
		await expect(
			tenant.page.getByText("I can move in quickly if rent is reduced to 57000."),
		).toBeVisible();

		await owner.page.goto(interestUrl, { waitUntil: "domcontentloaded" });
		await owner.page.waitForFunction(
			() => (window as { __rentalFormsReady?: boolean }).__rentalFormsReady === true,
		);

		await owner.page.getByLabel("Counter terms").fill("I agree at 59000 with two months deposit.");
		await owner.page.getByRole("button", { name: "Send counter" }).click();
		await expect(owner.page.getByText("I agree at 59000 with two months deposit.")).toBeVisible();

		await owner.page.getByRole("button", { name: "Accept final terms" }).click();
		await expect(owner.page).toHaveURL(interestUrl);
		await expect(owner.page.getByText("Agreement accepted")).toBeVisible();
		await expect(owner.page.getByRole("button", { name: "Start move-in" })).toBeVisible();

		const ownerWorkspaceAfterAccept = await readApiResponse(
			await owner.page.request.get(`/api/wf-rental/interests/${interestId}/workspace`, {
				headers: {
					Accept: "application/json",
				},
			}),
		);

		await tenant.page.goto(interestUrl, { waitUntil: "domcontentloaded" });

		try {
			await tenant.page.waitForFunction(
				() => (window as { __rentalFormsReady?: boolean }).__rentalFormsReady === true,
				undefined,
				{ timeout: 5000 },
			);
		} catch (error) {
			debug.tenantFormsReadyWaitError = error instanceof Error ? error.message : String(error);
		}

		await expect(tenant.page.getByText("Agreement accepted")).toBeVisible();

		const tenantWorkspaceAfterAccept = await readApiResponse(
			await tenant.page.request.get(`/api/wf-rental/interests/${interestId}/workspace`, {
				headers: {
					Accept: "application/json",
				},
			}),
		);

		const tenantPageStateAfterAccept = await dumpVisiblePageState(tenant.page);
		const tenantHtml = await tenant.page.content();

		debug.afterOwnerAcceptFinalTerms = {
			ownerWorkspaceSummary: summarizeWorkspace(ownerWorkspaceAfterAccept),
			tenantWorkspaceSummary: summarizeWorkspace(tenantWorkspaceAfterAccept),
			tenantPageState: tenantPageStateAfterAccept,
			rawOwnerWorkspace: ownerWorkspaceAfterAccept,
			rawTenantWorkspace: tenantWorkspaceAfterAccept,
		};

		mkdirSync(dirname(OUT_FILE), { recursive: true });
		writeFileSync(OUT_FILE, JSON.stringify(debug, null, 2));
		writeFileSync(OUT_HTML_FILE, tenantHtml);

		console.log(`\nWorkflow post-final-terms debug JSON:\n${OUT_FILE}\n`);
		console.log(`Workflow post-final-terms tenant HTML:\n${OUT_HTML_FILE}\n`);
		console.log(
			JSON.stringify(
				{
					title,
					interestUrl,
					interestId,
					tenantWorkspaceSummary: summarizeWorkspace(tenantWorkspaceAfterAccept),
					tenantPageStateAfterAccept,
				},
				null,
				2,
			),
		);
	} finally {
		await owner.context.close();
		await tenant.context.close();
	}
});