import { expect, test } from "@playwright/test";

import { RENTAL_LOCAL_USERS } from "../rental-local-users.js";
import {
	createPublishedFlatThroughOwnerUi,
	loginAsLocalDevAdmin,
	loginAsLocalRentalUser,
	marketplaceAssetCard,
	ownerAssetManagement,
	ownerInboxItem,
	uniqueRentalTitle,
} from "../rental-flow-utils.js";

test("local persistent users complete the thin Astro rental UI flow", async ({ browser }) => {
	test.setTimeout(120_000);

	const owner = await loginAsLocalRentalUser(browser, RENTAL_LOCAL_USERS.owner.email);
	const tenant = await loginAsLocalRentalUser(browser, RENTAL_LOCAL_USERS.tenant.email);

	try {
		const title = uniqueRentalTitle("Habitat Mayflower UI");

		await owner.page.goto("/", { waitUntil: "domcontentloaded" });
		await expect(owner.page.getByRole("link", { name: "View marketplace" }).first()).toBeVisible();
		await expect(owner.page.getByRole("link", { name: "Dashboard" })).toBeVisible();
		await expect(owner.page.getByRole("link", { name: "Add new property" })).toBeVisible();
		await expect(owner.page.getByText("My assets")).toBeVisible();
		await expect(owner.page.getByText("My applications")).toBeVisible();
		await expect(owner.page.getByText("My handovers")).toBeVisible();

		const { assetUrl } = await createPublishedFlatThroughOwnerUi(owner.page, title);

		await owner.page.goto("/owner", { waitUntil: "domcontentloaded" });
		const listedOwnerAsset = ownerAssetManagement(owner.page, title);
		await expect(listedOwnerAsset).toBeVisible();
		await expect(listedOwnerAsset.getByRole("button", { name: "Already published" })).toBeVisible();

		await owner.page.goto(assetUrl, { waitUntil: "domcontentloaded" });

		await tenant.page.goto("/marketplace", { waitUntil: "domcontentloaded" });
		await expect(tenant.page.getByRole("heading", { name: "Published assets" })).toBeVisible();

		const tenantAssetCard = marketplaceAssetCard(tenant.page, title);
		await expect(tenantAssetCard).toBeVisible();
		await expect(tenantAssetCard.getByRole("link", { name: "View details" })).toBeVisible();
		await expect(tenantAssetCard.getByRole("link", { name: "Express interest" })).toBeVisible();

		await tenantAssetCard.getByRole("link", { name: title }).click();
		await expect(tenant.page).toHaveURL(assetUrl);

		await tenant.page.waitForFunction(
			() => (window as { __rentalFormsReady?: boolean }).__rentalFormsReady === true,
		);
		await tenant.page.getByLabel("Name").fill("Tenant Manual Created 1");
		await tenant.page.getByLabel("Official email").fill("tenant_manual_created_1@company.example.com");
		await tenant.page.getByLabel("Employer").fill("Manual Company");
		await tenant.page.getByLabel("Offer").fill("59000");
		await tenant.page.getByLabel("Message").fill("Interested after accepting owner conditions.");
		await tenant.page.getByLabel("I accept the current owner conditions.").check();
		await tenant.page.getByRole("button", { name: "Express interest" }).click();

		await expect(tenant.page).toHaveURL(/\/interests\/[^/]+$/);
		const interestUrl = tenant.page.url();

		await expect(tenant.page.getByText("submitted", { exact: true })).toBeVisible();
		await expect(tenant.page.getByText("Interest sent to owner / owner AI agent")).toBeVisible();
		await expect(tenant.page.getByRole("button", { name: "Answer" })).toHaveCount(0);

		await tenant.page.goto(assetUrl, { waitUntil: "domcontentloaded" });
		await expect(tenant.page.getByText("Interest submitted")).toBeVisible();
		await expect(tenant.page.getByRole("button", { name: "Express interest" })).toHaveCount(0);

		await owner.page.goto("/owner", { waitUntil: "domcontentloaded" });
		await expect(owner.page.getByRole("heading", { name: "Submitted interest inbox" })).toBeVisible();

		const inboxItem = ownerInboxItem(owner.page, title, "Tenant Manual Created 1");
		await expect(inboxItem).toBeVisible();
		await expect(inboxItem.getByText("Official email: tenant_manual_created_1@company.example.com")).toBeVisible();
		await expect(inboxItem.getByText("Employer: Manual Company")).toBeVisible();
		await expect(inboxItem.getByText("Offer: 59000")).toBeVisible();
		await expect(inboxItem.getByText("View details")).toBeVisible();

		await inboxItem.click();
		await expect(owner.page).toHaveURL(interestUrl);

		await owner.page.waitForFunction(
			() => (window as { __rentalFormsReady?: boolean }).__rentalFormsReady === true,
		);
		await owner.page.getByLabel("Question").fill("Please upload company ID and salary slip.");
		await owner.page.getByRole("button", { name: "Ask question" }).click();
		await expect(
			owner.page.getByRole("article").getByText("Please upload company ID and salary slip."),
		).toBeVisible();

		await tenant.page.goto(interestUrl, { waitUntil: "domcontentloaded" });
		await tenant.page.waitForFunction(
			() => (window as { __rentalFormsReady?: boolean }).__rentalFormsReady === true,
		);
		await expect(
			tenant.page.getByRole("article").getByText("Please upload company ID and salary slip."),
		).toBeVisible();
		await expect(tenant.page.getByText("1 pending")).toBeVisible();
		await expect(tenant.page.getByRole("button", { name: "Ask question" })).toHaveCount(0);
		await tenant.page.getByLabel("Answer").fill("Company ID and salary slip shared.");
		await tenant.page.getByRole("button", { name: "Answer" }).click();
		await expect(
			tenant.page.getByRole("article").getByText("Company ID and salary slip shared."),
		).toBeVisible();

		await owner.page.goto(interestUrl, { waitUntil: "domcontentloaded" });
		await owner.page.waitForFunction(
			() => (window as { __rentalFormsReady?: boolean }).__rentalFormsReady === true,
		);
		await expect(
			owner.page.getByRole("article").getByText("Company ID and salary slip shared."),
		).toBeVisible();
		await expect(owner.page.getByRole("button", { name: "Answer" })).toHaveCount(0);

		await tenant.page.goto(interestUrl, { waitUntil: "domcontentloaded" });
		await tenant.page.waitForFunction(
			() => (window as { __rentalFormsReady?: boolean }).__rentalFormsReady === true,
		);
		await tenant.page.locator("#offer-price").fill("57000");
		await tenant.page.locator("#offer-deposit").fill("120000");
		await tenant.page.locator("#offer-message").fill("I can move in quickly if rent is reduced to 57000.");
		await tenant.page.getByRole("button", { name: "Offer" }).click();
		await expect(
			tenant.page.getByRole("article").getByText("I can move in quickly if rent is reduced to 57000."),
		).toBeVisible();

		await owner.page.goto(interestUrl, { waitUntil: "domcontentloaded" });
		await owner.page.waitForFunction(
			() => (window as { __rentalFormsReady?: boolean }).__rentalFormsReady === true,
		);
		await owner.page.locator("#counter-price").fill("59000");
		await owner.page.locator("#counter-message").fill("I agree at 59000 with two months deposit.");
		await owner.page.getByRole("button", { name: "Counter" }).click();
		await expect(
			owner.page.getByRole("article").getByText("I agree at 59000 with two months deposit."),
		).toBeVisible();

		await owner.page.getByRole("button", { name: "Accept final terms" }).click();
		await expect(owner.page).toHaveURL(/\/owner$/);

		const bookedOwnerAsset = ownerAssetManagement(owner.page, title);
		await expect(bookedOwnerAsset).toBeVisible();
		await expect(bookedOwnerAsset.getByText("business_state: booked")).toBeVisible();
		await expect(bookedOwnerAsset.getByText("visibility_state: restricted")).toBeVisible();
		await expect(bookedOwnerAsset.getByText("Start move-in handover")).toBeVisible();

		await bookedOwnerAsset.getByRole("button", { name: "Start move-in" }).click();

		await expect(owner.page).toHaveURL(/\/handover\/[^/]+$/);
		const handoverUrl = owner.page.url();
		await expect(owner.page.getByRole("heading", { name: "Handover checklist" })).toBeVisible();
		await expect(owner.page.locator(".check-list article")).toHaveCount(15);

		await tenant.page.goto(interestUrl, { waitUntil: "domcontentloaded" });
		await expect(tenant.page.getByText("Agreement accepted")).toBeVisible();
		await expect(tenant.page.getByText("Next step: booking amount")).toBeVisible();

		await tenant.page.goto(handoverUrl, { waitUntil: "domcontentloaded" });
		await tenant.page.waitForFunction(
			() => (window as { __rentalFormsReady?: boolean }).__rentalFormsReady === true,
		);
		await tenant.page.getByRole("button", { name: "Accept move-in handover" }).click();
		await expect(tenant.page).not.toHaveURL(/\/owner$/);
		await expect(tenant.page).toHaveURL(handoverUrl);
		await expect(tenant.page.getByText("accepted", { exact: true })).toBeVisible();

		await owner.page.goto("/owner", { waitUntil: "domcontentloaded" });
		const rentedOwnerAsset = ownerAssetManagement(owner.page, title);
		await expect(rentedOwnerAsset).toBeVisible();
		await expect(rentedOwnerAsset.getByText("business_state: rented")).toBeVisible();
		await expect(rentedOwnerAsset.getByText("Start move-out handover")).toBeVisible();

		const anonymous = await browser.newContext({ baseURL: "http://localhost:4444" });
		const anonymousPage = await anonymous.newPage();
		await anonymousPage.goto("/marketplace", { waitUntil: "domcontentloaded" });
		await expect(anonymousPage.getByText(title)).toHaveCount(0);
		await anonymous.close();

		await owner.page.goto("/_emdash/admin/", { waitUntil: "domcontentloaded" });
		await expect(owner.page).not.toHaveURL(/\/_emdash\/admin\/?$/);
		await owner.page.goto("/marketplace", { waitUntil: "domcontentloaded" });
		await expect(owner.page.getByRole("heading", { name: "Published assets" })).toBeVisible();

		const devAdmin = await loginAsLocalDevAdmin(browser);
		await devAdmin.context.close();
	} finally {
		await owner.context.close();
		await tenant.context.close();
	}
});