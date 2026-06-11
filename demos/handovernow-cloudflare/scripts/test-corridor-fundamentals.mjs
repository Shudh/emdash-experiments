import { chromium } from "@playwright/test";
import { access } from "node:fs/promises";
import { resolve } from "node:path";

const DEFAULT_TEST_BASE_URL = "https://cms.handovernow.com";

const ROLE_EMAILS = {
shudh: "shudh.datta@gmail.com",
raphael: "raphael.datta.2009@gmail.com",
};

function normalizeRole(value) {
const rawValue = value?.trim().toLowerCase();

if (rawValue === "raphael") {
return "raphael";
}

return "shudh";
}

function normalizeBaseUrl(value) {
const rawValue = value?.trim() || DEFAULT_TEST_BASE_URL;
return rawValue.replace(/\/+$/, "");
}

function authFileForRole(role) {
return resolve(process.cwd(), "playwright", ".auth", `test-corridor-${role}.json`);
}

function profileDirForRole(role) {
return resolve(process.cwd(), "playwright", ".profiles", `test-corridor-${role}-manual`);
}

async function fileExists(path) {
try {
await access(path);
return true;
} catch {
return false;
}
}

function printAuthRefreshInstructions(role, expectedEmail, baseUrl) {
	console.log("");
	console.log("AUTH STATE IS MISSING OR STALE");
	console.log("");
	console.log("Run this one command to refresh the saved login state:");
	console.log("");
	console.log(`HN_TEST_BASE_URL="${baseUrl}" \\`);
	console.log(`HN_AUTH_ROLE="${role}" \\`);
	console.log(`HN_AUTH_EMAIL="${expectedEmail}" \\`);
	console.log("node scripts/test-corridor-auth-refresh.mjs");
	console.log("");
	console.log("What it will do:");
	console.log("1. Open a normal Google Chrome window.");
	console.log("2. Send Chrome internal logs to playwright/.logs instead of polluting the terminal.");
	console.log("3. Let you manually complete Cloudflare Access OTP.");
	console.log("4. Let you manually complete HandoverNow Google OAuth.");
	console.log("5. Verify TEST LANE, Published assets, and Welcome email.");
	console.log("6. Save the fresh cookies to playwright/.auth.");
	console.log("");
	console.log("After it succeeds, rerun this fundamentals test.");
	console.log("");
}

function step(message) {
console.log("");
console.log(`▶ ${message}`);
}

function pass(message) {
console.log(`  ✓ ${message}`);
}

function fail(message) {
throw new Error(message);
}

async function bodyText(page) {
try {
return await page.locator("body").innerText({ timeout: 10_000 });
} catch {
return "";
}
}

async function currentHandoverNowEmail(page) {
const account = page.locator(".wf1-account").first();

try {
if ((await page.locator(".wf1-account").count()) < 1) {
return null;
}

if (!(await account.isVisible({ timeout: 5_000 }))) {
return null;
}

const text = (await account.textContent()) ?? "";
const match = text.match(/Welcome\s+(.+?)\s*$/i);

if (!match?.[1]) {
return null;
}

return match[1].trim().toLowerCase();
} catch {
return null;
}
}

async function visibleCount(locator) {
try {
return await locator.count();
} catch {
return 0;
}
}

async function expectBodyContains(page, expectedText, label) {
const text = await bodyText(page);

if (!text.includes(expectedText)) {
fail(`${label} missing expected text: ${expectedText}\nCurrent URL: ${page.url()}\nBody preview:\n${text.slice(0, 900)}`);
}

pass(label);
}

async function expectUrlIncludes(page, expectedPart, label) {
const url = page.url();

if (!url.includes(expectedPart)) {
fail(`${label} failed.\nExpected URL to include: ${expectedPart}\nActual URL: ${url}`);
}

pass(label);
}

async function expectNoBadLinks(page) {
const oldWfLinks = await page.locator('a[href^="/wf/"]').count();
const duplicatedCorridorLinks = await page.locator('a[href*="/test-corridor/test-corridor"]').count();

if (oldWfLinks !== 0) {
fail(`Found ${oldWfLinks} old /wf/ links. Test-corridor pages should use /test-corridor/wf1 links.`);
}

if (duplicatedCorridorLinks !== 0) {
fail(`Found ${duplicatedCorridorLinks} duplicated /test-corridor/test-corridor links.`);
}

pass("No stale /wf/ links and no duplicated test-corridor links");
}

async function checkAuthOrExplain(page, role, expectedEmail, baseUrl) {
const text = await bodyText(page);
const actualEmail = await currentHandoverNowEmail(page);
const loginLinkCount = await visibleCount(page.getByRole("link", { name: /^Login$/ }));

if (page.url().includes("cloudflareaccess.com") || text.includes("Cloudflare Access")) {
printAuthRefreshInstructions(role, expectedEmail, baseUrl);
fail("Cloudflare Access login is required again. Saved auth state is stale or missing Cloudflare cookies.");
}

if (actualEmail !== expectedEmail.toLowerCase()) {
if (loginLinkCount > 0) {
printAuthRefreshInstructions(role, expectedEmail, baseUrl);
fail(`HandoverNow app login is missing. Header still shows Login. Expected Welcome ${expectedEmail}.`);
}

printAuthRefreshInstructions(role, expectedEmail, baseUrl);
fail(`Wrong or missing HandoverNow account. Expected ${expectedEmail}; detected ${actualEmail ?? "none"}.`);
}

pass(`Authenticated as ${expectedEmail}`);
}

async function checkTestHeaders(response) {
if (!response) {
console.log("  ! No navigation response object available; skipping response header check.");
return;
}

const cacheControl = response.headers()["cache-control"] ?? "";
const robots = response.headers()["x-robots-tag"] ?? "";

if (!cacheControl.toLowerCase().includes("no-store")) {
console.log(`  ! cache-control did not include no-store. Actual: ${cacheControl || "(missing)"}`);
} else {
pass("Test-corridor response has cache-control no-store");
}

if (!robots.toLowerCase().includes("noindex")) {
console.log(`  ! x-robots-tag did not include noindex. Actual: ${robots || "(missing)"}`);
} else {
pass("Test-corridor response has x-robots-tag noindex");
}
}

async function checkMarketplaceApi(page) {
const result = await page.evaluate(async () => {
const response = await fetch("/test-corridor/api/wf1-rental/marketplace/assets", {
method: "GET",
credentials: "same-origin",
headers: {
"X-EmDash-Request": "1",
},
});

const text = await response.text();
let json = null;

try {
json = JSON.parse(text);
} catch {
json = null;
}

return {
ok: response.ok,
status: response.status,
contentType: response.headers.get("content-type"),
bodyText: text.slice(0, 700),
json,
};
});

if (!result.ok) {
fail(
[
"Test-corridor marketplace API failed.",
`Status: ${result.status}`,
`Content-Type: ${result.contentType ?? "(missing)"}`,
"Body preview:",
result.bodyText,
].join("\n"),
);
}

if (!result.json || result.json.ok !== true) {
fail(`Test-corridor marketplace API did not return { ok: true }.\nBody preview:\n${result.bodyText}`);
}

if (!result.json.data || !Array.isArray(result.json.data.items)) {
fail(`Test-corridor marketplace API did not return data.items array.\nBody preview:\n${result.bodyText}`);
}

pass(`Marketplace API returned ok=true with ${result.json.data.items.length} test-lane item(s)`);
}

async function maybeOpenFirstAsset(page) {
const cardGrid = page.locator("[data-marketplace-grid]");
const hasGrid = (await cardGrid.count()) > 0;

if (!hasGrid) {
console.log("  ! No marketplace grid found. This is acceptable if there are no published test assets.");
return;
}

const firstAssetLink = page.locator("[data-marketplace-grid] article h2 a").first();

if ((await firstAssetLink.count()) < 1) {
console.log("  ! Marketplace grid exists, but no asset title link was found. Skipping asset-detail click.");
return;
}

const title = ((await firstAssetLink.textContent()) ?? "").trim();

step(`Opening first marketplace asset: ${title || "(untitled asset)"}`);
await firstAssetLink.click();
await page.waitForLoadState("domcontentloaded");

await expectUrlIncludes(page, "/test-corridor/wf1/marketplace/assets/", "Asset detail URL stays in test corridor");
await expectBodyContains(page, "TEST LANE", "Asset detail shows TEST LANE");
await expectNoBadLinks(page);
}

async function main() {
const role = normalizeRole(process.env.HN_AUTH_ROLE);
const expectedEmail = (process.env.HN_AUTH_EMAIL?.trim() || ROLE_EMAILS[role]).toLowerCase();
const baseUrl = normalizeBaseUrl(process.env.HN_TEST_BASE_URL);
const authFile = process.env.HN_AUTH_FILE?.trim() || authFileForRole(role);
const headless = process.env.HN_HEADLESS === "1";
const slowMo = Number(process.env.HN_SLOWMO_MS ?? "60");
const marketplaceUrl = `${baseUrl}/test-corridor/wf1/marketplace`;

console.log("");
console.log("HandoverNow test-corridor fundamentals test");
console.log("");
console.log(`Base URL: ${baseUrl}`);
console.log(`Role: ${role}`);
console.log(`Expected account: ${expectedEmail}`);
console.log(`Auth state file: ${authFile}`);
console.log(`Headless: ${headless ? "yes" : "no"}`);
console.log("");

if (!(await fileExists(authFile))) {
printAuthRefreshInstructions(role, expectedEmail, baseUrl);
fail(`Auth state file does not exist: ${authFile}`);
}

const browser = await chromium.launch({
headless,
slowMo,
});

const context = await browser.newContext({
storageState: authFile,
viewport: { width: 1440, height: 950 },
locale: "en-IN",
timezoneId: "Asia/Kolkata",
});

const page = await context.newPage();

try {
step("Opening authenticated test-corridor marketplace");
const response = await page.goto(marketplaceUrl, { waitUntil: "domcontentloaded" });

await checkTestHeaders(response);
await checkAuthOrExplain(page, role, expectedEmail, baseUrl);
await expectBodyContains(page, "TEST LANE", "Marketplace shows TEST LANE");
await expectBodyContains(page, "Published assets", "Marketplace shows Published assets");
await expectUrlIncludes(page, "/test-corridor/wf1/marketplace", "Marketplace URL is under test corridor");
await expectNoBadLinks(page);

step("Checking test-corridor marketplace API from the authenticated page");
await checkMarketplaceApi(page);

step("Clicking Available flats navigation");
await page.getByRole("link", { name: /^Available flats$/ }).click();
await page.waitForLoadState("domcontentloaded");
await expectUrlIncludes(page, "/test-corridor/wf1/marketplace", "Available flats keeps user in test corridor");
await expectBodyContains(page, "Published assets", "Available flats page renders marketplace");

await maybeOpenFirstAsset(page);

step("Clicking Owner navigation");
await page.goto(`${baseUrl}/test-corridor/wf1/marketplace`, { waitUntil: "domcontentloaded" });
await page.getByRole("link", { name: /^Owner$/ }).click();
await page.waitForLoadState("domcontentloaded");
await expectUrlIncludes(page, "/test-corridor/wf1/owner", "Owner URL is under test corridor");
await expectBodyContains(page, "TEST LANE", "Owner page shows TEST LANE");
await expectBodyContains(page, "Dashboard", "Owner dashboard renders");
await expectNoBadLinks(page);

step("Clicking List asset navigation");
await page.getByRole("link", { name: /^List asset$/ }).click();
await page.waitForLoadState("domcontentloaded");
await expectUrlIncludes(page, "/test-corridor/wf1/owner/assets/new", "List asset URL is under test corridor");
await expectBodyContains(page, "TEST LANE", "Create asset page shows TEST LANE");
await expectBodyContains(page, "Create draft asset", "Create asset form renders");
await expectBodyContains(page, "Asset config items", "Create asset page renders inventory section");
await expectNoBadLinks(page);

const titleInputCount = await page.locator("#title").count();
const priceInputCount = await page.locator("#publicPrice").count();
const publishCheckboxCount = await page.locator('input[name="publish"]').count();

if (titleInputCount !== 1) {
fail(`Expected exactly one #title input on create asset page; found ${titleInputCount}.`);
}

if (priceInputCount !== 1) {
fail(`Expected exactly one #publicPrice input on create asset page; found ${priceInputCount}.`);
}

if (publishCheckboxCount !== 1) {
fail(`Expected exactly one publish checkbox on create asset page; found ${publishCheckboxCount}.`);
}

pass("Create asset form has title, price, and publish controls");

console.log("");
console.log("SUCCESS");
console.log("Fundamentals passed:");
console.log("- Auth state is valid");
console.log("- HandoverNow app session is Shudh");
console.log("- Test lane marketplace renders");
console.log("- Test-corridor marketplace API returns ok=true");
console.log("- Navigation stays inside /test-corridor/wf1");
console.log("- Owner dashboard renders");
console.log("- Create asset page renders");
console.log("- No old /wf/ links or duplicated test-corridor paths were found");
console.log("");
} finally {
await context.close().catch(() => undefined);
await browser.close().catch(() => undefined);
}
}

main().catch((error) => {
console.error("");
console.error("FAILED");
console.error(error instanceof Error ? error.message : error);
console.error("");
process.exitCode = 1;
});
