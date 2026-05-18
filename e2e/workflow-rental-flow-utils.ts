import { expect, type Browser, type Page } from "@playwright/test";

import { loginAsLocalRentalUser, timeSuffix, type LocalRentalActor } from "./rental-flow-utils.js";

export const WORKFLOW_RENTAL_BASE_URL = "http://localhost:4450";
const WF_ASSET_DETAIL_URL_PATTERN = /\/wf\/marketplace\/assets\/[^/]+$/;

export function uniqueWorkflowRentalTitle(prefix = "Workflow Habitat Mayflower"): string {
	return `${prefix} ${timeSuffix()}`;
}

export async function loginAsWorkflowRentalUser(
	browser: Browser,
	email: string,
): Promise<LocalRentalActor> {
	return loginAsLocalRentalUser(browser, email, WORKFLOW_RENTAL_BASE_URL);
}

export function workflowMarketplaceAssetCard(page: Page, title: string) {
	return page.locator(".asset-card").filter({ hasText: title });
}

export function workflowOwnerAssetManagement(page: Page, title: string) {
	return page.locator(".asset-management").filter({ hasText: title });
}

export async function createWorkflowFlatThroughOwnerUi(page: Page, title: string) {
	await page.goto("/wf/owner/assets/new", { waitUntil: "domcontentloaded" });
	await expect(page.getByRole("heading", { name: "Asset config items" })).toBeVisible();
	await page.getByRole("button", { name: "Add starter flat inventory" }).click();
	await expect(page.locator(".inventory-row")).toHaveCount(14);
	await page.getByLabel("Title").fill(title);
	await page.getByLabel("Location").fill("Bangalore");
	await page.getByLabel("Price").fill("60000");
	await page.getByRole("button", { name: "Create asset" }).click();
	await expect(page).toHaveURL(WF_ASSET_DETAIL_URL_PATTERN, { timeout: 15_000 });
	await expect(page.getByRole("heading", { name: title })).toBeVisible();
	return { title, assetUrl: page.url() };
}
