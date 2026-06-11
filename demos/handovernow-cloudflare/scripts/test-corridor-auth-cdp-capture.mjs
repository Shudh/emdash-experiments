import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const DEFAULT_CDP_URL = "http://127.0.0.1:9222";
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

async function ensureAuthDirectory(authFile) {
await mkdir(dirname(authFile), { recursive: true });
}

async function readBodyText(page) {
try {
return await page.locator("body").innerText({ timeout: 10_000 });
} catch {
return "";
}
}

async function currentHandoverNowEmail(page) {
const account = page.locator(".wf1-account").first();

try {
const count = await page.locator(".wf1-account").count();

if (count < 1) {
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

async function findOrCreatePage(browser, targetUrl) {
const contexts = browser.contexts();

if (contexts.length < 1) {
throw new Error("No browser contexts found in the connected Chrome instance.");
}

const context = contexts[0];
const pages = context.pages();

for (const page of pages) {
const url = page.url();

if (url.includes("cms.handovernow.com") || url.includes("handovernow.com")) {
return { context, page };
}
}

const page = pages[0] ?? await context.newPage();
await page.goto(targetUrl, { waitUntil: "domcontentloaded" });

return { context, page };
}

async function verifyTestCorridorState(page, expectedEmail) {
const actualEmail = await currentHandoverNowEmail(page);
const bodyText = await readBodyText(page);

const hasExpectedEmail = actualEmail === expectedEmail.toLowerCase();
const hasTestLane = bodyText.includes("TEST LANE");
const hasPublishedAssets = bodyText.includes("Published assets");

return {
ok: hasExpectedEmail && hasTestLane && hasPublishedAssets,
actualEmail,
hasExpectedEmail,
hasTestLane,
hasPublishedAssets,
bodyPreview: bodyText.slice(0, 900),
};
}

async function main() {
const role = normalizeRole(process.env.HN_AUTH_ROLE);
const expectedEmail = (process.env.HN_AUTH_EMAIL?.trim() || ROLE_EMAILS[role]).toLowerCase();
const baseUrl = normalizeBaseUrl(process.env.HN_TEST_BASE_URL);
const cdpUrl = process.env.HN_CDP_URL?.trim() || DEFAULT_CDP_URL;
const targetUrl = `${baseUrl}/test-corridor/wf1/marketplace`;
const authFile = authFileForRole(role);

await ensureAuthDirectory(authFile);

console.log("");
console.log("Connecting to manually opened Chrome over CDP.");
console.log(`CDP URL: ${cdpUrl}`);
console.log(`Expected HandoverNow account: ${expectedEmail}`);
console.log(`Target URL: ${targetUrl}`);
console.log(`Auth file will be saved to: ${authFile}`);
console.log("");

const browser = await chromium.connectOverCDP(cdpUrl, {
timeout: 30_000,
isLocal: true,
});

try {
const { context, page } = await findOrCreatePage(browser, targetUrl);

await page.goto(targetUrl, { waitUntil: "domcontentloaded" });

const verification = await verifyTestCorridorState(page, expectedEmail);

if (!verification.ok) {
throw new Error(
[
"Chrome is connected, but the expected logged-in test corridor state was not found.",
`Expected email: ${expectedEmail}`,
`Detected email: ${verification.actualEmail ?? "none"}`,
`Has expected email: ${verification.hasExpectedEmail}`,
`Has TEST LANE: ${verification.hasTestLane}`,
`Has Published assets: ${verification.hasPublishedAssets}`,
`Current URL: ${page.url()}`,
"",
"Body preview:",
verification.bodyPreview,
].join("\n"),
);
}

await context.storageState({ path: authFile });

console.log("");
console.log("SUCCESS");
console.log(`Saved authenticated state for: ${expectedEmail}`);
console.log(`Saved file: ${authFile}`);
console.log("");
} finally {
await browser.close().catch(() => undefined);
}
}

main().catch((error) => {
console.error("");
console.error("FAILED");
console.error(error);
console.error("");
process.exitCode = 1;
});
