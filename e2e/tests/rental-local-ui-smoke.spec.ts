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

		await owner.page.goto("/owner/assets/new", { waitUntil: "domcontentloaded" });
		await owner.page.getByLabel("Title").fill(title);
		await owner.page.getByLabel("Location").fill("Bangalore");
		await owner.page.getByLabel("Price").fill("60000");
		await owner.page.getByRole("button", { name: "Create asset" }).click();
		await expect(owner.page).toHaveURL(/\/marketplace\/assets\/[^/]+$/);
		await expect(owner.page.getByRole("heading", { name: title })).toBeVisible();
		const assetUrl = owner.page.url();

		await tenant.page.goto("/marketplace", { waitUntil: "domcontentloaded" });
		await expect(tenant.page.getByRole("heading", { name: "Published assets" })).toBeVisible();
		await tenant.page.getByRole("link", { name: new RegExp(title) }).click();
		await expect(tenant.page).toHaveURL(assetUrl);
		await tenant.page.getByLabel("Name").fill("Tenant Manual Created 1");
		await tenant.page.getByLabel("Official email").fill("tenant_manual_created_1@company.example.com");
		await tenant.page.getByLabel("Employer").fill("Manual Company");
		await tenant.page.getByLabel("Offer").fill("59000");
		await tenant.page.getByLabel("Message").fill("Interested after accepting owner conditions.");
		await tenant.page.getByLabel("I accept the current owner conditions.").check();
		await tenant.page.getByRole("button", { name: "Express interest" }).click();
		await expect(tenant.page).toHaveURL(/\/marketplace$/);

		await owner.page.goto("/owner", { waitUntil: "domcontentloaded" });
		await expect(owner.page.getByRole("heading", { name: "Submitted interest inbox" })).toBeVisible();
		await owner.page.getByRole("link", { name: /Tenant Manual Created 1/ }).click();
		await expect(owner.page).toHaveURL(/\/interests\/[^/]+$/);
		const interestUrl = owner.page.url();
		await owner.page.getByLabel("Question").fill("Please upload company ID and salary slip.");
		await owner.page.getByRole("button", { name: "Ask question" }).click();
		await expect(
			owner.page.getByRole("article").getByText("Please upload company ID and salary slip."),
		).toBeVisible();

		await tenant.page.goto(interestUrl, { waitUntil: "domcontentloaded" });
		await tenant.page.getByLabel("Answer").fill("Company ID and salary slip shared.");
		await tenant.page.getByRole("button", { name: "Answer" }).click();
		await expect(
			tenant.page.getByRole("article").getByText("Company ID and salary slip shared."),
		).toBeVisible();

		await owner.page.goto(interestUrl, { waitUntil: "domcontentloaded" });
		await owner.page.getByRole("button", { name: "Accept final terms" }).click();
		await expect(owner.page).toHaveURL(/\/owner$/);
		await expect(owner.page.getByText("booked")).toBeVisible();
	} finally {
		await owner.context.close();
		await tenant.context.close();
	}
});
