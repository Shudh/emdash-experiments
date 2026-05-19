import { expect, test } from "@playwright/test";

import { loginAsLocalRentalUser, timeSuffix } from "../rental-flow-utils.js";
import { RENTAL_LOCAL_USERS } from "../rental-local-users.js";

const WF1_BASE_URL = "http://localhost:4450";
const WORKSPACE_URL_PATTERN = /\/wf1\/workspaces\/[^/]+$/;

function uniqueWf1Title() {
	return `WF1 Eva Flat ${timeSuffix()}`;
}

test("Eva and Rakesh complete simple available-rented WF1 UI flow", async ({ browser }) => {
	test.setTimeout(120_000);

	const eva = await loginAsLocalRentalUser(browser, RENTAL_LOCAL_USERS.owner.email, WF1_BASE_URL);
	const rakesh = await loginAsLocalRentalUser(
		browser,
		RENTAL_LOCAL_USERS.tenant.email,
		WF1_BASE_URL,
	);

	try {
		const title = uniqueWf1Title();

		await eva.page.goto("/wf1/owner/assets/new", { waitUntil: "domcontentloaded" });
		await expect(eva.page.getByRole("heading", { name: "Asset config items" })).toBeVisible();
		await eva.page.getByRole("button", { name: "Add starter flat inventory" }).click();
		await expect(eva.page.locator(".inventory-row")).toHaveCount(14);
		await eva.page.getByLabel("Title").fill(title);
		await eva.page.getByLabel("Publish to marketplace").check();
		await eva.page.getByRole("button", { name: "Create asset" }).click();
		await expect(eva.page).toHaveURL(/\/wf1\/marketplace\/assets\/[^/]+$/);
		const assetUrl = eva.page.url();

		await rakesh.page.goto("/wf1/marketplace", { waitUntil: "domcontentloaded" });
		const assetCard = rakesh.page.locator(".asset-card").filter({ hasText: title });
		await expect(assetCard).toBeVisible();
		await assetCard.getByRole("link", { name: title }).click();
		await expect(rakesh.page).toHaveURL(assetUrl);
		await rakesh.page.waitForFunction(
			() => (window as { __rentalFormsReady?: boolean }).__rentalFormsReady === true,
		);
		await rakesh.page.getByLabel("Workflow definition").selectOption("simple-available-rented");
		await rakesh.page
			.getByLabel("Official email")
			.fill("tenant_manual_created_1@company.example.com");
		await rakesh.page.getByLabel("I accept the current owner conditions.").check();
		await rakesh.page.getByRole("button", { name: "Express interest" }).click();
		await expect(rakesh.page).toHaveURL(WORKSPACE_URL_PATTERN);
		const workspaceUrl = rakesh.page.url();
		await expect(rakesh.page.getByText("Asset State: listed")).toBeVisible();
		await expect(rakesh.page.getByText("Application State: available")).toBeVisible();

		await eva.page.goto("/wf1/owner", { waitUntil: "domcontentloaded" });
		const ownerAsset = eva.page.locator(".asset-management").filter({ hasText: title });
		await expect(ownerAsset).toBeVisible();
		await expect(ownerAsset.getByText("Application State: available").first()).toBeVisible();
		await ownerAsset.getByRole("link", { name: "Open workspace" }).first().click();
		await expect(eva.page).toHaveURL(WORKSPACE_URL_PATTERN);
		await expect(eva.page.getByText("Available Task Cards")).toBeVisible();
		await expect(eva.page.getByRole("button", { name: "Mark rented" })).toBeVisible();

		await eva.page.getByLabel("Payment task").fill("Please submit payment reference/proof.");
		await eva.page.getByRole("button", { name: "Create payment proof task" }).click();
		await expect(
			eva.page.getByRole("heading", { name: "Payment proof task" }).first(),
		).toBeVisible();
		await expect(eva.page.getByText("Other Side's Open Tasks")).toBeVisible();

		await rakesh.page.goto(workspaceUrl, { waitUntil: "domcontentloaded" });
		await expect(rakesh.page.getByText("My Open Tasks")).toBeVisible();
		await rakesh.page.getByLabel("Reference").fill("UPI-WF1-TEST-001");
		await rakesh.page.getByRole("button", { name: "Answer" }).click();
		await expect(rakesh.page.getByText("UPI-WF1-TEST-001")).toBeVisible();

		await eva.page.goto(workspaceUrl, { waitUntil: "domcontentloaded" });
		await expect(eva.page.getByRole("button", { name: "Mark rented" })).toBeEnabled();
		await eva.page.getByRole("button", { name: "Mark rented" }).click();
		await expect(eva.page.getByText("Asset State: rented")).toBeVisible();
		await expect(eva.page.getByText("Application State: rented")).toBeVisible();

		const wf1Home = await eva.page.goto("/wf1", { waitUntil: "domcontentloaded" });
		expect(wf1Home).not.toBeNull();
		expect(await wf1Home!.text()).not.toContain("/wf/");
	} finally {
		await eva.context.close();
		await rakesh.context.close();
	}
});
