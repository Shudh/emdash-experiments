import { expect, test } from "@playwright/test";

import { RENTAL_LOCAL_USERS } from "../rental-local-users.js";
import {
	WORKFLOW_RENTAL_BASE_URL,
	loginAsWorkflowRentalUser,
} from "../workflow-rental-flow-utils.js";

const ALLOWED_NON_WORKFLOW_PREFIXES = ["/login", "/_emdash"];

function isAllowedWorkflowHref(href: string): boolean {
	if (!href.startsWith("/")) {
		return true;
	}

	if (href.startsWith("/wf")) {
		return true;
	}

	if (href.startsWith("/api/wf-rental")) {
		return true;
	}

	return ALLOWED_NON_WORKFLOW_PREFIXES.some((prefix) => {
		return href === prefix || href.startsWith(`${prefix}?`) || href.startsWith(`${prefix}/`);
	});
}

test("workflow rental pages keep header and product links inside the /wf namespace", async ({ browser }) => {
	const owner = await loginAsWorkflowRentalUser(browser, RENTAL_LOCAL_USERS.owner.email);

	try {
		await owner.page.goto(`${WORKFLOW_RENTAL_BASE_URL}/wf`, { waitUntil: "domcontentloaded" });

		await expect(owner.page.getByText("WF CORE PREVIEW")).toBeVisible();
		await expect(owner.page.getByText("Workflow-card engine route boundary is active")).toBeVisible();

		const workflowLinks = await owner.page.locator('a[href^="/"]').evaluateAll((anchors) => {
			return anchors.map((anchor) => {
				return {
					text: anchor.textContent?.trim() ?? "",
					href: anchor.getAttribute("href") ?? "",
				};
			});
		});

		const leakingLinks = workflowLinks.filter((link) => {
			return !isAllowedWorkflowHref(link.href);
		});

		expect(leakingLinks).toEqual([]);

		await owner.page.getByRole("link", { name: /Marketplace/i }).first().click();
		await expect(owner.page).toHaveURL(/\/wf\/marketplace$/);

		await owner.page.getByRole("link", { name: /Owner/i }).first().click();
		await expect(owner.page).toHaveURL(/\/wf\/owner$/);

		await owner.page.getByRole("link", { name: /List asset/i }).first().click();
		await expect(owner.page).toHaveURL(/\/wf\/owner\/assets\/new$/);
	} finally {
		await owner.context.close();
	}
});