import { expect, test } from "@playwright/test";

import { RENTAL_LOCAL_USERS } from "../rental-local-users.js";
import {
	createWorkflowFlatThroughOwnerUi,
	loginAsWorkflowRentalUser,
	workflowMarketplaceAssetCard,
	uniqueWorkflowRentalTitle,
} from "../workflow-rental-flow-utils.js";

test("local persistent users complete workflow rental parity UI flow", async ({ browser }) => {
	test.setTimeout(120_000);

	const owner = await loginAsWorkflowRentalUser(browser, RENTAL_LOCAL_USERS.owner.email);
	const tenant = await loginAsWorkflowRentalUser(browser, RENTAL_LOCAL_USERS.tenant.email);

	try {
		const title = uniqueWorkflowRentalTitle();
		const { assetUrl } = await createWorkflowFlatThroughOwnerUi(owner.page, title);

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
		await expect(tenant.page.getByText("Negotiation unavailable")).not.toBeVisible();
		const interestUrl = tenant.page.url();

		await expect(tenant.page.getByText("Application submitted")).toBeVisible();
		await expect(tenant.page.getByText("Please take me please")).toBeVisible();

		await owner.page.goto("/wf/owner", { waitUntil: "domcontentloaded" });
		await expect(owner.page.getByRole("heading", { name: "Submitted interest inbox" })).toBeVisible();
		await owner.page.locator(".inbox-item").filter({ hasText: title }).click();
		await expect(owner.page).toHaveURL(interestUrl);

		await owner.page.waitForFunction(
			() => (window as { __rentalFormsReady?: boolean }).__rentalFormsReady === true,
		);

		await expect(owner.page.getByText("Application submitted")).toBeVisible();
		await expect(owner.page.getByText("Please take me please")).toBeVisible();
		await expect(owner.page.getByRole("button", { name: "Accept applicant" })).toBeVisible();

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
		await expect(
	owner.page.getByRole("heading", {
		name: "Request booking payment confirmation",
		exact: true,
	}),
).toBeVisible();
		await expect(owner.page.getByRole("button", { name: "Start move-in" })).toBeVisible();

		await tenant.page.goto(interestUrl, { waitUntil: "domcontentloaded" });
await expect(
	tenant.page.getByRole("heading", {
		name: "Agreement accepted",
		exact: true,
	}),
).toBeVisible();

const waitingMessage = tenant.page.getByTestId("waiting-message");
await expect(waitingMessage).toBeVisible();
await expect(
	waitingMessage.getByRole("heading", {
		name: "No action needed now",
		exact: true,
	}),
).toBeVisible();
await expect(waitingMessage).toContainText("The owner will send the next request");

		await owner.page.goto(interestUrl, { waitUntil: "domcontentloaded" });
		await owner.page.getByLabel("Payment request").fill("Please share booking payment reference or proof.");
		await owner.page.getByRole("button", { name: "Request booking payment confirmation" }).click();
		await expect(owner.page.getByText("Please share booking payment reference or proof.")).toBeVisible();

		await tenant.page.goto(interestUrl, { waitUntil: "domcontentloaded" });
		await tenant.page.getByLabel("Reference").fill("UPI-TEST-REF-001");
		await tenant.page.getByRole("button", { name: "Answer" }).click();
		await expect(tenant.page.getByText("Reference: UPI-TEST-REF-001")).toBeVisible();

		await owner.page.goto(interestUrl, { waitUntil: "domcontentloaded" });
		await owner.page.getByRole("button", { name: "Start move-in" }).click();
		await expect(owner.page.getByText("Move-in started")).toBeVisible();

		await tenant.page.goto(interestUrl, { waitUntil: "domcontentloaded" });
		await expect(tenant.page.getByText("Move-in started")).toBeVisible();
		await tenant.page.getByRole("button", { name: "Accept move-in" }).click();
await expect(
	tenant.page.getByRole("heading", {
		name: "Rented",
		exact: true,
	}),
).toBeVisible();
	} finally {
		await owner.context.close();
		await tenant.context.close();
	}
});