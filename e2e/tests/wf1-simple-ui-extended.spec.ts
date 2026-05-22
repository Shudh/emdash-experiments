import { Buffer } from "node:buffer";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { loginAsLocalRentalUser, timeSuffix } from "../rental-flow-utils.js";
import { RENTAL_LOCAL_USERS } from "../rental-local-users.js";

const WF1_BASE_URL = "http://localhost:4450";
const WORKSPACE_URL_PATTERN = /\/wf1\/workspaces\/[^/]+$/;
const EXTENDED_INITIAL_MONTHLY_PRICE = 60_000;
const EXTENDED_RELISTED_MONTHLY_PRICE = Math.round(EXTENDED_INITIAL_MONTHLY_PRICE * 1.1);

const ONE_BY_ONE_PNG = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgAlyl6wAAAAASUVORK5CYII=",
	"base64",
);

function uniqueWf1Title() {
	return `WF1 Eva Flat ${timeSuffix()}-${Date.now()}`;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function assetStateText(state: string): RegExp {
	return new RegExp(`Asset\\s+State:\\s+${escapeRegExp(state)}`, "i");
}

function applicationFormStateText(state: string): RegExp {
	return new RegExp(
		`Application\\s+(?:Form(?:'s|s)?\\s+)?State:\\s+${escapeRegExp(state)}`,
		"i",
	);
}

function assetIdFromMarketplaceAssetUrl(url: string): string {
	const match = url.match(/\/wf1\/marketplace\/assets\/([^/?#]+)/);

	if (!match?.[1]) {
		throw new Error(`Could not read asset id from URL: ${url}`);
	}

	return decodeURIComponent(match[1]);
}

function workflowInstanceIdFromWorkspaceUrl(url: string): string {
	const match = url.match(/\/wf1\/workspaces\/([^/?#]+)/);

	if (!match?.[1]) {
		throw new Error(`Could not read workflow instance id from URL: ${url}`);
	}

	return decodeURIComponent(match[1]);
}

function rupeeAmountText(amount: number): RegExp {
	const amountText = new Intl.NumberFormat("en-IN", {
		maximumFractionDigits: 0,
	}).format(amount);

	return new RegExp(`₹\\s*${escapeRegExp(amountText)}`);
}

async function expectAssetState(scope: Page | Locator, state: string) {
	await expect(scope.getByText(assetStateText(state)).first()).toBeVisible();
}

async function expectApplicationFormState(scope: Page | Locator, state: string) {
	await expect(scope.getByText(applicationFormStateText(state)).first()).toBeVisible();
}

function firstFormWithButton(page: Page, buttonName: string | RegExp): Locator {
	return page
		.locator("form")
		.filter({ has: page.getByRole("button", { name: buttonName }) })
		.first();
}

async function firstVisibleFormWithButtonAfterOpeningComposer(
	page: Page,
	buttonName: string | RegExp,
	cardTypeValue: string,
): Promise<Locator> {
	let form = firstFormWithButton(page, buttonName);

	if (await form.isVisible().catch(() => false)) {
		return form;
	}

	const openComposerButton = page.getByRole("button", { name: /^Create new task$/ });

	if (await openComposerButton.isVisible().catch(() => false)) {
		await openComposerButton.click();
	}

	const taskType = page.getByLabel(/^Task type$/);

	if (await taskType.isVisible().catch(() => false)) {
		await taskType.selectOption(cardTypeValue);
	}

	form = firstFormWithButton(page, buttonName);
	await expect(form).toBeVisible();

	return form;
}

function firstFormContaining(page: Page, text: string | RegExp): Locator {
	return page.locator("form").filter({ hasText: text }).first();
}

async function uploadRequiredEvidence(form: Locator, filename: string) {
	await form.getByLabel("Required evidence image/PDF").setInputFiles({
		name: filename,
		mimeType: "image/png",
		buffer: ONE_BY_ONE_PNG,
	});

	await expect(
		form.locator("[data-media-status]").filter({ hasText: "Uploaded." }).first(),
	).toBeVisible();
}

async function expectAnyEvidenceAttachment(page: Page) {
	const attachedMedia = page.locator('[aria-label="Attached media"]').first();
	const openAttachmentButton = page.getByRole("button", { name: /^Open .+/ }).first();
	const openFileLink = page.getByRole("link", { name: "Open file" }).first();

	await expect(attachedMedia.or(openAttachmentButton).or(openFileLink).first()).toBeVisible();
}

async function answerRequiredEvidenceTask(
	page: Page,
	taskText: string | RegExp,
	answerText: string,
	filename: string,
) {
	const answerForm = firstFormContaining(page, taskText);

	await expect(answerForm).toBeVisible();
	await answerForm.getByLabel(/^Answer$/i).fill(answerText);
	await uploadRequiredEvidence(answerForm, filename);
	await answerForm.getByRole("button", { name: /^Answer$/ }).click();

	await expect(page.getByText(answerText).first()).toBeVisible();
	await expectAnyEvidenceAttachment(page);
}

async function clickAndWaitForSettledPage(button: Locator, page: Page) {
	await button.click();
	await page.waitForLoadState("domcontentloaded").catch(() => undefined);
}

async function updateOwnerAssetPublicPriceFromWorkspace(
	page: Page,
	workflowInstanceId: string,
	publicPrice: number,
) {
	const result = await page.evaluate(
		async ({ workflowInstanceId, publicPrice }) => {
			type JsonObject = Record<string, unknown>;

			function objectValue(value: unknown): JsonObject {
				return value && typeof value === "object" && !Array.isArray(value)
					? (value as JsonObject)
					: {};
			}

			const workspaceResponse = await fetch(`/api/wf1-rental/workspaces/${workflowInstanceId}`, {
				method: "GET",
				credentials: "same-origin",
				headers: {
					Accept: "application/json",
					"X-EmDash-Request": "1",
				},
			});

			const workspacePayload = await workspaceResponse.json().catch(() => ({}));

			if (!workspaceResponse.ok) {
				return {
					ok: false,
					status: workspaceResponse.status,
					stage: "load-workspace",
					payload: workspacePayload,
				};
			}

			const workspaceData = objectValue(objectValue(workspacePayload).data);
			const asset = objectValue(workspaceData.asset);
			const assetId = String(asset.id ?? "");

			if (!assetId) {
				return {
					ok: false,
					status: 0,
					stage: "missing-asset-id",
					payload: workspacePayload,
				};
			}

			const updateResponse = await fetch(`/api/wf1-rental/owner/assets/${assetId}/config`, {
				method: "POST",
				credentials: "same-origin",
				headers: {
					"Content-Type": "application/json",
					"X-EmDash-Request": "1",
				},
				body: JSON.stringify({
					publicPrice,
					currency: asset.currency ?? "INR",
					minimumMonths: asset.minimum_months ?? undefined,
					configSpec: asset.config_spec ?? {},
					conditionSpec: asset.condition_spec ?? {},
					ownerConditionsSpec: asset.owner_conditions_spec ?? {},
				}),
			});

			const updatePayload = await updateResponse.json().catch(() => ({}));

			return {
				ok: updateResponse.ok,
				status: updateResponse.status,
				stage: "update-price",
				payload: updatePayload,
			};
		},
		{ workflowInstanceId, publicPrice },
	);

	expect(result.ok, JSON.stringify(result)).toBe(true);
}

test("Eva and Rakesh complete generic WF1 application form flow", async ({ browser }) => {
	test.setTimeout(180_000);

	const eva = await loginAsLocalRentalUser(browser, RENTAL_LOCAL_USERS.owner.email, WF1_BASE_URL);
	const rakesh = await loginAsLocalRentalUser(
		browser,
		RENTAL_LOCAL_USERS.tenant.email,
		WF1_BASE_URL,
	);

	try {
		const title = uniqueWf1Title();

		await test.step("Eva creates and publishes a WF1 asset with starter config items", async () => {
			await eva.page.goto("/wf1/owner/assets/new", { waitUntil: "domcontentloaded" });
			await expect(eva.page.getByRole("heading", { name: "Asset config items" })).toBeVisible();

			await eva.page.getByRole("button", { name: "Add starter flat inventory" }).click();
			await expect(eva.page.locator(".inventory-row")).toHaveCount(14);

			await eva.page.getByLabel("Title").fill(title);
			await eva.page.getByLabel("Price").fill(String(EXTENDED_INITIAL_MONTHLY_PRICE));
			await eva.page.getByLabel("Publish to marketplace").check();
			await eva.page.getByRole("button", { name: "Create asset" }).click();

			await expect(eva.page).toHaveURL(/\/wf1\/marketplace\/assets\/[^/]+$/);
		});

		const assetUrl = eva.page.url();
		const assetId = assetIdFromMarketplaceAssetUrl(assetUrl);
		let workspaceUrl = "";

		await test.step("Anonymous marketplace shows login-to-apply state", async () => {
			const anonymous = await browser.newContext({ baseURL: WF1_BASE_URL });

			try {
				const anonymousPage = await anonymous.newPage();
				await anonymousPage.goto("/wf1/marketplace", { waitUntil: "domcontentloaded" });

				const anonymousCard = anonymousPage.locator(".asset-card").filter({ hasText: title });

				await expect(anonymousCard).toBeVisible();
				await expect(anonymousCard.getByRole("link", { name: "Login to apply" })).toBeVisible();
			} finally {
				await anonymous.close();
			}
		});

		await test.step("Rakesh applies using rental-application-form-basic", async () => {
			await rakesh.page.goto("/wf1/marketplace", { waitUntil: "domcontentloaded" });

			const assetCard = rakesh.page.locator(".asset-card").filter({ hasText: title });

			await expect(assetCard).toBeVisible();
			await expect(assetCard.getByRole("link", { name: "View and apply" })).toBeVisible();

			await assetCard.getByRole("link", { name: "View and apply" }).click();
			await expect(rakesh.page).toHaveURL(assetUrl);

			await rakesh.page.waitForFunction(
				() => (window as { __rentalFormsReady?: boolean }).__rentalFormsReady === true,
			);

			await rakesh.page.getByLabel("Workflow definition").selectOption("rental-application-form-basic");
			await rakesh.page
				.getByLabel("Official email")
				.fill("tenant_manual_created_1@company.example.com");
			await rakesh.page.getByLabel("I accept the current owner conditions.").check();
			await rakesh.page.getByRole("button", { name: "Express interest" }).click();

			await expect(rakesh.page).toHaveURL(WORKSPACE_URL_PATTERN);
			workspaceUrl = rakesh.page.url();

			await expectAssetState(rakesh.page, "listed");
			await expectApplicationFormState(rakesh.page, "application_under_review");
		});

		await test.step("Rakesh can reopen his application workspace from marketplace", async () => {
			await rakesh.page.goto("/wf1/marketplace", { waitUntil: "domcontentloaded" });

			const appliedCard = rakesh.page.locator(".asset-card").filter({ hasText: title });

			await expect(appliedCard).toBeVisible();
			await expect(appliedCard.getByRole("link", { name: "Open application workspace" })).toBeVisible();

			await appliedCard.getByRole("link", { name: "Open application workspace" }).click();
			await expect(rakesh.page).toHaveURL(WORKSPACE_URL_PATTERN);

			await expectAssetState(rakesh.page, "listed");
			await expectApplicationFormState(rakesh.page, "application_under_review");
		});

		await test.step("Eva opens the workspace and creates a generic required-evidence task", async () => {
			await eva.page.goto("/wf1/owner", { waitUntil: "domcontentloaded" });

			const ownerAsset = eva.page.locator(".asset-management").filter({ hasText: title });

			await expect(ownerAsset).toBeVisible();
			await expectApplicationFormState(ownerAsset, "application_under_review");

			await ownerAsset.getByRole("link", { name: "Open workspace" }).first().click();
			await expect(eva.page).toHaveURL(WORKSPACE_URL_PATTERN);

			await expect(eva.page.getByTestId("wf1-asset-config-items")).toBeVisible();
			await expect(eva.page.getByRole("button", { name: /^Accept as tenant$/ })).toBeVisible();

			const genericEvidencePrompt = "Please submit confirmation text and evidence.";
			const genericEvidenceForm = await firstVisibleFormWithButtonAfterOpeningComposer(
				eva.page,
				/^Create evidence task$/,
				"free_text_required_evidence",
			);

			await genericEvidenceForm.getByLabel(/^Task$/).fill(genericEvidencePrompt);
			await clickAndWaitForSettledPage(
				genericEvidenceForm.getByRole("button", { name: /^Create evidence task$/ }),
				eva.page,
			);

			const otherSideOpenTasks = eva.page.getByTestId("wf1-other-open-tasks");

			await expect(otherSideOpenTasks).toBeVisible();
			await expect(otherSideOpenTasks.getByText(genericEvidencePrompt).first()).toBeVisible();

			await expect(eva.page.getByRole("button", { name: /^Accept as tenant$/ })).toBeDisabled();
		});

		await test.step("Rakesh answers the generic evidence task with text and uploaded media", async () => {
			await rakesh.page.goto(workspaceUrl, { waitUntil: "domcontentloaded" });
			await expect(rakesh.page.getByText("My Open Tasks")).toBeVisible();

			await answerRequiredEvidenceTask(
				rakesh.page,
				"Please submit confirmation text and evidence.",
				"Evidence text for generic task.",
				"wf1-generic-evidence.png",
			);

			await expectApplicationFormState(rakesh.page, "application_under_review");
		});

		await test.step("Eva accepts Rakesh as tenant after required evidence is complete", async () => {
			await eva.page.goto(workspaceUrl, { waitUntil: "domcontentloaded" });

			await expect(eva.page.getByText("Evidence text for generic task.").first()).toBeVisible();
			await expectAnyEvidenceAttachment(eva.page);

			await expect(eva.page.getByRole("button", { name: /^Accept as tenant$/ })).toBeEnabled();
			await clickAndWaitForSettledPage(
				eva.page.getByRole("button", { name: /^Accept as tenant$/ }),
				eva.page,
			);

			await expectAssetState(eva.page, "rented");
			await expectApplicationFormState(eva.page, "accepted_as_tenant");
		});

		await test.step("Eva starts move-out and sees the return-check generator", async () => {
			await expect(eva.page.getByRole("button", { name: /^Request move-out$/ })).toBeEnabled();
			await clickAndWaitForSettledPage(
				eva.page.getByRole("button", { name: /^Request move-out$/ }),
				eva.page,
			);

			await expectAssetState(eva.page, "return_pending");
			await expectApplicationFormState(eva.page, "moveout_requested");

			await expect(eva.page.getByTestId("wf1-moveout-task-generator")).toBeVisible();
			await expect(eva.page.getByText("Create return-check tasks")).toBeVisible();
		});

		await test.step("Eva generates a return-check evidence task from asset config items", async () => {
			const generator = eva.page.getByTestId("wf1-moveout-task-generator");

			await expect(generator.locator('input[name="assetConfigItemId"]').first()).toBeVisible();
			await generator.locator('input[name="assetConfigItemId"]').first().check();

			await clickAndWaitForSettledPage(
				generator.getByRole("button", { name: /^Create selected return-check tasks$/ }),
				eva.page,
			);

			await expect(
				eva.page.getByText(/Please write the current condition and attach image\/PDF evidence/i).first(),
			).toBeVisible();

			await expect(eva.page.getByRole("button", { name: /^Close move-out$/ })).toBeDisabled();
		});

		await test.step("Rakesh answers the return-check task with required evidence", async () => {
			await rakesh.page.goto(workspaceUrl, { waitUntil: "domcontentloaded" });

			await expectApplicationFormState(rakesh.page, "moveout_requested");
			await expect(
				rakesh.page.getByText(/Please write the current condition and attach image\/PDF evidence/i).first(),
			).toBeVisible();

			await answerRequiredEvidenceTask(
				rakesh.page,
				/Please write the current condition and attach image\/PDF evidence/i,
				"Return-check evidence attached.",
				"wf1-return-evidence.png",
			);
		});

		await test.step("Eva closes move-out after return-check evidence", async () => {
			await eva.page.goto(workspaceUrl, { waitUntil: "domcontentloaded" });

			await expect(eva.page.getByText("Return-check evidence attached.").first()).toBeVisible();
			await expectAnyEvidenceAttachment(eva.page);

			await expect(eva.page.getByRole("button", { name: /^Close move-out$/ })).toBeEnabled();
			await clickAndWaitForSettledPage(
				eva.page.getByRole("button", { name: /^Close move-out$/ }),
				eva.page,
			);

			await expectAssetState(eva.page, "listed");

			await expectApplicationFormState(eva.page, "moveout_closed");
		});

		await test.step("Closed move-out asset is off-market until owner explicitly relists it", async () => {
			await eva.page.goto("/wf1/marketplace", { waitUntil: "domcontentloaded" });

			const offMarketCard = eva.page.locator(".asset-card").filter({ hasText: title });

			await expect(offMarketCard).toHaveCount(0);
		});

		await test.step("Eva increases rent by 10 percent and relists the asset", async () => {
			const workflowInstanceId = workflowInstanceIdFromWorkspaceUrl(workspaceUrl);

			await updateOwnerAssetPublicPriceFromWorkspace(
				eva.page,
				workflowInstanceId,
				EXTENDED_RELISTED_MONTHLY_PRICE,
			);

			await eva.page.goto("/wf1/owner", { waitUntil: "domcontentloaded" });

			const ownerAsset = eva.page.locator(".asset-management").filter({ hasText: title });

			await expect(ownerAsset).toBeVisible();
			await expectAssetState(ownerAsset, "listed");
			await expect(ownerAsset.getByText("restricted").first()).toBeVisible();
			await expect(ownerAsset.getByRole("button", { name: /^Publish to marketplace$/ })).toBeVisible();

			await ownerAsset.getByRole("button", { name: /^Publish to marketplace$/ }).click();
			await eva.page.waitForLoadState("domcontentloaded").catch(() => undefined);

			const publishedOwnerAsset = eva.page.locator(".asset-management").filter({ hasText: title });

			await expect(publishedOwnerAsset).toBeVisible();
			await expectAssetState(publishedOwnerAsset, "listed");
			await expect(publishedOwnerAsset.getByText("marketplace").first()).toBeVisible();
		});

		await test.step("Relisted asset appears in marketplace with increased rent", async () => {
			const marketplacePage = await eva.context.newPage();

			try {
				await marketplacePage.goto("/wf1/marketplace", { waitUntil: "domcontentloaded" });

				const relistedCard = marketplacePage.locator(".asset-card").filter({ hasText: title });

				await expect(relistedCard).toBeVisible();
				await expect(
					relistedCard.getByText(rupeeAmountText(EXTENDED_RELISTED_MONTHLY_PRICE)).first(),
				).toBeVisible();
				await expect(relistedCard.getByText("marketplace").first()).toBeVisible();
			} finally {
				await marketplacePage.close();
			}
		});

		await test.step("WF1 home does not leak old /wf links", async () => {
			const wf1Page = await eva.context.newPage();

			try {
				const wf1Home = await wf1Page.goto("/wf1", { waitUntil: "domcontentloaded" });

				expect(wf1Home).not.toBeNull();
				expect(await wf1Home!.text()).not.toContain("/wf/");
			} finally {
				await wf1Page.close();
			}
		});

		expect(assetId).toBeTruthy();
	} finally {
		await eva.context.close();
		await rakesh.context.close();
	}
});