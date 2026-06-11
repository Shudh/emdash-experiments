import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

type AuthRole = "shudh" | "raphael";

const DEFAULT_TEST_BASE_URL = "https://cms.handovernow.com";

const ROLE_EMAILS: Record<AuthRole, string> = {
	shudh: "shudh.datta@gmail.com",
	raphael: "raphael.datta.2009@gmail.com",
};

function normalizeBaseUrl(value: string | undefined): string {
	const rawValue = value?.trim() || DEFAULT_TEST_BASE_URL;
	return rawValue.replace(/\/+$/, "");
}

function normalizeRole(value: string | undefined): AuthRole {
	const rawValue = value?.trim().toLowerCase();

	if (rawValue === "raphael") {
		return "raphael";
	}

	return "shudh";
}

function authFileForRole(role: AuthRole): string {
	return resolve(process.cwd(), "playwright", ".auth", `test-corridor-${role}.json`);
}

async function ensureAuthDirectory(authFile: string): Promise<void> {
	await mkdir(dirname(authFile), { recursive: true });
}

async function currentHandoverNowEmail(page: Page): Promise<string | null> {
	const account = page.locator(".wf1-account").first();

	if (!(await account.isVisible().catch(() => false))) {
		return null;
	}

	const text = (await account.textContent()) ?? "";
	const match = text.match(/Welcome\s+(.+?)\s*$/i);

	if (!match?.[1]) {
		return null;
	}

	return match[1].trim().toLowerCase();
}

async function logoutIfWrongHandoverNowUser(
	page: Page,
	targetUrl: string,
	expectedEmail: string,
): Promise<boolean> {
	const actualEmail = await currentHandoverNowEmail(page);

	if (actualEmail === null) {
		return false;
	}

	if (actualEmail === expectedEmail.toLowerCase()) {
		return false;
	}

	const logoutButton = page.locator("[data-wf1-logout]").first();

	if (await logoutButton.isVisible().catch(() => false)) {
		console.log("");
		console.log(`Wrong HandoverNow user detected: ${actualEmail}`);
		console.log(`Expected user: ${expectedEmail}`);
		console.log("Logging out the wrong HandoverNow app session now.");
		await logoutButton.click();
		await page.waitForLoadState("domcontentloaded").catch(() => undefined);
		await page.goto(targetUrl, { waitUntil: "domcontentloaded" });
		return true;
	}

	return false;
}

async function pauseForHumanLogin(page: Page, targetUrl: string, expectedEmail: string): Promise<void> {
	console.log("");
	console.log("Manual login required.");
	console.log(`Target URL: ${targetUrl}`);
	console.log(`Expected HandoverNow account: ${expectedEmail}`);
	console.log("");
	console.log("In the opened browser:");
	console.log("1. Complete Cloudflare Access email OTP.");
	console.log("2. Then complete HandoverNow / Google OAuth login.");
	console.log(`3. Make sure the header shows: Welcome ${expectedEmail}`);
	console.log("4. Then click Resume in the Playwright Inspector.");
	console.log("");

	await page.pause();
}

test("capture Shudh/Raphael test-corridor authenticated state manually", async ({ page }) => {
	const role = normalizeRole(process.env.HN_AUTH_ROLE);
	const expectedEmail = (process.env.HN_AUTH_EMAIL?.trim() || ROLE_EMAILS[role]).toLowerCase();
	const baseUrl = normalizeBaseUrl(process.env.HN_TEST_BASE_URL);
	const targetUrl = `${baseUrl}/test-corridor/wf1/marketplace`;
	const authFile = authFileForRole(role);

	await ensureAuthDirectory(authFile);

	await page.goto(targetUrl, { waitUntil: "domcontentloaded" });

	await pauseForHumanLogin(page, targetUrl, expectedEmail);

	for (let attempt = 1; attempt <= 3; attempt += 1) {
		await page.goto(targetUrl, { waitUntil: "domcontentloaded" });

		const loggedOutWrongUser = await logoutIfWrongHandoverNowUser(page, targetUrl, expectedEmail);

		if (loggedOutWrongUser) {
			await pauseForHumanLogin(page, targetUrl, expectedEmail);
			continue;
		}

		const actualEmail = await currentHandoverNowEmail(page);

		if (actualEmail === expectedEmail) {
			await expect(page.getByText("TEST LANE")).toBeVisible();
			await expect(page.getByRole("heading", { name: /Published assets/i }).first()).toBeVisible();
			await page.context().storageState({ path: authFile });

			console.log("");
			console.log(`Saved authenticated state for ${expectedEmail}`);
			console.log(`Auth file: ${authFile}`);
			console.log("");

			return;
		}

		console.log("");
		console.log(`Could not yet confirm HandoverNow login as ${expectedEmail}.`);
		console.log("You may still be at Cloudflare Access, Google OAuth, or the app login screen.");
		console.log(`Attempt ${attempt} of 3.`);
		console.log("");

		await pauseForHumanLogin(page, targetUrl, expectedEmail);
	}

	await page.goto(targetUrl, { waitUntil: "domcontentloaded" });

	const finalEmail = await currentHandoverNowEmail(page);
	const bodyText = (await page.textContent("body").catch(() => "")) ?? "";

	throw new Error(
		[
			`Could not capture authenticated state for ${expectedEmail}.`,
			`Detected HandoverNow email: ${finalEmail ?? "none"}`,
			`Current URL: ${page.url()}`,
			`Body preview: ${bodyText.slice(0, 500)}`,
		].join("\n"),
	);
});