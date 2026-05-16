import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { RENTAL_LOCAL_USERS } from "../rental-local-users.js";

const BASE_URL = "http://localhost:4444";
const JSON_HEADERS = {
	"Content-Type": "application/json",
	"X-EmDash-Request": "1",
};

type LocalActor = {
	context: BrowserContext;
	page: Page;
};

async function loginAs(browser: Browser, email: string): Promise<LocalActor> {
	const context = await browser.newContext({ baseURL: BASE_URL });
	const page = await context.newPage();
	await page.goto("/", { waitUntil: "domcontentloaded" });
	const response = await page.evaluate(async (loginEmail) => {
		const login = await fetch("/api/setup/dev-login-as", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-EmDash-Request": "1",
			},
			body: JSON.stringify({ email: loginEmail }),
		});
		return { status: login.status, body: await login.json() };
	}, email);
	expect(response.status).toBe(200);
	return { context, page };
}

async function loginAsDevAdmin(browser: Browser): Promise<LocalActor> {
	const context = await browser.newContext({ baseURL: BASE_URL });
	const page = await context.newPage();
	await page.goto("/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin/", {
		waitUntil: "domcontentloaded",
	});
	await expect(page).toHaveURL(/\/_emdash\/admin\/?/);
	return { context, page };
}

async function resetRentalStore(): Promise<void> {
	const response = await fetch(`${BASE_URL}/api/rental/reset`, {
		method: "POST",
		headers: JSON_HEADERS,
		body: "{}",
	});
	expect(response.status).toBe(200);
}

test("local persistent users complete the thin Astro rental UI flow", async ({ browser }) => {
	test.setTimeout(120_000);

	await resetRentalStore();
	const owner = await loginAs(browser, RENTAL_LOCAL_USERS.owner.email);
	const tenant = await loginAs(browser, RENTAL_LOCAL_USERS.tenant.email);

	try {
		const title = `UI Smoke Flat ${Date.now()}`;

		await owner.page.goto("/", { waitUntil: "domcontentloaded" });
		await expect(owner.page.getByRole("link", { name: "View marketplace" }).first()).toBeVisible();
		await expect(owner.page.getByRole("link", { name: "Dashboard" })).toBeVisible();
		await expect(owner.page.getByRole("link", { name: "Add new property" })).toBeVisible();
		await expect(owner.page.getByText("My assets")).toBeVisible();
		await expect(owner.page.getByText("My applications")).toBeVisible();
		await expect(owner.page.getByText("My handovers")).toBeVisible();

		await owner.page.goto("/owner/assets/new", { waitUntil: "domcontentloaded" });
		await expect(owner.page.getByRole("heading", { name: "Asset config items" })).toBeVisible();
		await owner.page.getByRole("button", { name: "Add starter flat inventory" }).click();
		await expect(owner.page.locator(".inventory-row")).toHaveCount(14);
		await owner.page.getByRole("button", { name: "Add row" }).click();
		await expect(owner.page.locator(".inventory-row")).toHaveCount(15);
		await owner.page.locator(".inventory-row").last().getByLabel("Item label").fill("Balcony grill");
		await owner.page.locator(".inventory-row").last().getByLabel("Item kind").fill("fixture");
		await owner.page.locator(".inventory-row").last().getByLabel("Room / group").fill("balcony");
		await owner.page.locator(".inventory-row").last().getByLabel("Quantity").fill("1");
		await owner.page.locator(".inventory-row").last().getByLabel("Owner declared state").fill("good");
		await owner.page.locator(".inventory-row").last().getByLabel("Condition details").fill("Paint intact.");
		await owner.page.getByRole("button", { name: "Add document" }).click();
		await owner.page.locator(".document-row-editor").last().getByLabel("Document key").fill("hr_verification_email");
		await owner.page.locator(".document-row-editor").last().getByLabel("Document name").fill("HR verification email");
		await owner.page.locator(".document-row-editor").last().locator('select[name="required"]').selectOption("false");
		await owner.page.locator(".document-row-editor").last().locator('select[name="attachmentRequired"]').selectOption("false");
		await owner.page.locator(".document-row-editor").last().getByLabel("Description").fill("Free text or screenshot is accepted.");
		await owner.page.getByLabel("Title").fill(title);
		await owner.page.getByLabel("Location").fill("Bangalore");
		await owner.page.getByLabel("Price").fill("60000");
		await owner.page.getByRole("button", { name: "Create asset" }).click();
		await expect(owner.page).toHaveURL(/\/marketplace\/assets\/[^/]+$/, { timeout: 15_000 });
		await expect(owner.page.getByRole("heading", { name: title })).toBeVisible();
		await expect(owner.page.getByText("status: published")).toBeVisible();
		await expect(owner.page.getByText("listed", { exact: true })).toBeVisible();
		await expect(owner.page.getByText("marketplace", { exact: true })).toBeVisible();
		await expect(owner.page.getByText("This is your asset")).toBeVisible();
		await expect(owner.page.getByRole("button", { name: "Express interest" })).toHaveCount(0);
		await expect(owner.page.getByText("[\"company_id\"")).toHaveCount(0);
		const assetUrl = owner.page.url();
		await owner.page.goto("/owner", { waitUntil: "domcontentloaded" });
		await expect(owner.page.getByRole("button", { name: "Already published" })).toBeVisible();
		await owner.page.goto(assetUrl, { waitUntil: "domcontentloaded" });

		await tenant.page.goto("/marketplace", { waitUntil: "domcontentloaded" });
		await expect(tenant.page.getByRole("heading", { name: "Published assets" })).toBeVisible();
		await expect(tenant.page.getByRole("link", { name: "View details" }).first()).toBeVisible();
		await expect(tenant.page.getByRole("link", { name: "Express interest" }).first()).toBeVisible();
		await tenant.page.getByRole("link", { name: new RegExp(title) }).click();
		await expect(tenant.page).toHaveURL(assetUrl);
		await tenant.page.waitForFunction(() => (window as { __rentalFormsReady?: boolean }).__rentalFormsReady === true);
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
		await expect(
			owner.page.getByRole("link", { name: new RegExp(`${title}.*Tenant Manual Created 1`) }),
		).toBeVisible();
		await expect(owner.page.getByText("Official email: tenant_manual_created_1@company.example.com")).toBeVisible();
		await expect(owner.page.getByText("Employer: Manual Company")).toBeVisible();
		await expect(owner.page.getByText("Offer: 59000")).toBeVisible();
		await expect(owner.page.getByRole("link", { name: "View details", exact: true }).first()).toBeVisible();
		await owner.page.getByRole("link", { name: /Tenant Manual Created 1/ }).click();
		await expect(owner.page).toHaveURL(interestUrl);
		await owner.page.waitForFunction(() => (window as { __rentalFormsReady?: boolean }).__rentalFormsReady === true);
		await owner.page.getByLabel("Question").fill("Please upload company ID and salary slip.");
		await owner.page.getByRole("button", { name: "Ask question" }).click();
		await expect(
			owner.page.getByRole("article").getByText("Please upload company ID and salary slip."),
		).toBeVisible();

		await tenant.page.goto(interestUrl, { waitUntil: "domcontentloaded" });
		await tenant.page.waitForFunction(() => (window as { __rentalFormsReady?: boolean }).__rentalFormsReady === true);
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
		await owner.page.waitForFunction(() => (window as { __rentalFormsReady?: boolean }).__rentalFormsReady === true);
		await expect(
			owner.page.getByRole("article").getByText("Company ID and salary slip shared."),
		).toBeVisible();
		await expect(owner.page.getByRole("button", { name: "Answer" })).toHaveCount(0);
		await tenant.page.goto(interestUrl, { waitUntil: "domcontentloaded" });
		await tenant.page.waitForFunction(() => (window as { __rentalFormsReady?: boolean }).__rentalFormsReady === true);
		await tenant.page.locator("#offer-price").fill("57000");
		await tenant.page.locator("#offer-deposit").fill("120000");
		await tenant.page.locator("#offer-message").fill("I can move in quickly if rent is reduced to 57000.");
		await tenant.page.getByRole("button", { name: "Offer" }).click();
		await expect(
			tenant.page.getByRole("article").getByText("I can move in quickly if rent is reduced to 57000."),
		).toBeVisible();

		await owner.page.goto(interestUrl, { waitUntil: "domcontentloaded" });
		await owner.page.waitForFunction(() => (window as { __rentalFormsReady?: boolean }).__rentalFormsReady === true);
		await owner.page.locator("#counter-price").fill("59000");
		await owner.page.locator("#counter-message").fill("I agree at 59000 with two months deposit.");
		await owner.page.getByRole("button", { name: "Counter" }).click();
		await expect(
			owner.page.getByRole("article").getByText("I agree at 59000 with two months deposit."),
		).toBeVisible();
		await owner.page.getByRole("button", { name: "Accept final terms" }).click();
		await expect(owner.page).toHaveURL(/\/owner$/);
		await expect(owner.page.getByText("business_state: booked")).toBeVisible();
		await expect(owner.page.getByText("visibility_state: restricted")).toBeVisible();
		await expect(owner.page.getByText("Start move-in handover")).toBeVisible();
		await owner.page.getByRole("button", { name: "Start move-in" }).click();
		await expect(owner.page).toHaveURL(/\/handover\/[^/]+$/);
		const handoverUrl = owner.page.url();
		await expect(owner.page.getByRole("heading", { name: "Handover checklist" })).toBeVisible();
		await expect(owner.page.locator(".check-list article")).toHaveCount(15);

		await tenant.page.goto(interestUrl, { waitUntil: "domcontentloaded" });
		await expect(tenant.page.getByText("Agreement accepted")).toBeVisible();
		await expect(tenant.page.getByText("Next step: booking amount")).toBeVisible();
		await tenant.page.goto(handoverUrl, { waitUntil: "domcontentloaded" });
		await tenant.page.waitForFunction(() => (window as { __rentalFormsReady?: boolean }).__rentalFormsReady === true);
		await tenant.page.getByRole("button", { name: "Accept move-in handover" }).click();
		await expect(tenant.page).not.toHaveURL(/\/owner$/);
		await expect(tenant.page).toHaveURL(handoverUrl);
		await expect(tenant.page.getByText("accepted", { exact: true })).toBeVisible();
		await owner.page.goto("/owner", { waitUntil: "domcontentloaded" });
		await expect(owner.page.getByText("business_state: rented")).toBeVisible();
		await expect(owner.page.getByText("Start move-out handover")).toBeVisible();

		const anonymous = await browser.newContext({ baseURL: BASE_URL });
		const anonymousPage = await anonymous.newPage();
		await anonymousPage.goto("/marketplace", { waitUntil: "domcontentloaded" });
		await expect(anonymousPage.getByText(title)).toHaveCount(0);
		await anonymous.close();

		await owner.page.goto("/_emdash/admin/", { waitUntil: "domcontentloaded" });
		await expect(owner.page).not.toHaveURL(/\/_emdash\/admin\/?$/);
		await owner.page.goto("/marketplace", { waitUntil: "domcontentloaded" });
		await expect(owner.page.getByRole("heading", { name: "Published assets" })).toBeVisible();

		const devAdmin = await loginAsDevAdmin(browser);
		await devAdmin.context.close();
	} finally {
		await owner.context.close();
		await tenant.context.close();
	}
});
