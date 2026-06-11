import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const DEFAULT_TEST_BASE_URL = "https://cms.handovernow.com";

const ROLE_EMAILS = {
shudh: "shudh.datta@gmail.com",
raphael: "raphael.datta.2009@gmail.com",
};

function normalizeBaseUrl(value) {
const rawValue = value?.trim() || DEFAULT_TEST_BASE_URL;
return rawValue.replace(/\/+$/, "");
}

function normalizeRole(value) {
const rawValue = value?.trim().toLowerCase();

if (rawValue === "raphael") {
return "raphael";
}

return "shudh";
}

function authFileForRole(role) {
return resolve(process.cwd(), "playwright", ".auth", `test-corridor-${role}.json`);
}

function profileDirForRole(role) {
return resolve(process.cwd(), "playwright", ".profiles", `test-corridor-${role}-chrome`);
}

async function ensureDirectory(path) {
await mkdir(path, { recursive: true });
}

async function ensureAuthDirectory(authFile) {
await mkdir(dirname(authFile), { recursive: true });
}

async function readBodyText(page) {
try {
return await page.locator("body").innerText({ timeout: 5_000 });
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

if (!(await account.isVisible())) {
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

async function logoutIfWrongHandoverNowUser(page, targetUrl, expectedEmail) {
const actualEmail = await currentHandoverNowEmail(page);

if (actualEmail === null) {
return false;
}

if (actualEmail === expectedEmail.toLowerCase()) {
return false;
}

const logoutButton = page.locator("[data-wf1-logout]").first();

try {
const logoutCount = await page.locator("[data-wf1-logout]").count();

if (logoutCount < 1 || !(await logoutButton.isVisible())) {
return false;
}

console.log("");
console.log(`Wrong HandoverNow app user detected: ${actualEmail}`);
console.log(`Expected HandoverNow app user: ${expectedEmail}`);
console.log("Clicking app logout now.");
console.log("");

await logoutButton.click();
await page.waitForLoadState("domcontentloaded").catch(() => undefined);
await page.goto(targetUrl, { waitUntil: "domcontentloaded" });

return true;
} catch {
return false;
}
}

async function askHumanToLogin(readline, targetUrl, expectedEmail, browserChannel, profileDir) {
console.log("");
console.log("Manual action required in the opened Google Chrome browser.");
console.log("");
console.log(`Browser channel: ${browserChannel}`);
console.log(`Automation Chrome profile: ${profileDir}`);
console.log(`Target URL: ${targetUrl}`);
console.log(`Expected HandoverNow account: ${expectedEmail}`);
console.log("");
console.log("Do this in the browser:");
console.log("1. Complete Cloudflare Access login.");
console.log(`   Use email: ${expectedEmail}`);
console.log("   Enter the OTP manually.");
console.log("2. After Cloudflare allows the page, use the HandoverNow header Login link.");
console.log("3. Complete Google OAuth / HandoverNow login.");
console.log(`   Use the same account: ${expectedEmail}`);
console.log("4. Wait until the HandoverNow header says:");
console.log(`   Welcome ${expectedEmail}`);
console.log("5. Also confirm the page shows TEST LANE and Published assets.");
console.log("");
await readline.question("After both logins are complete, come back here and press ENTER...");
console.log("");
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
bodyPreview: bodyText.slice(0, 700),
};
}

async function main() {
const role = normalizeRole(process.env.HN_AUTH_ROLE);
const expectedEmail = (process.env.HN_AUTH_EMAIL?.trim() || ROLE_EMAILS[role]).toLowerCase();
const baseUrl = normalizeBaseUrl(process.env.HN_TEST_BASE_URL);
const targetUrl = `${baseUrl}/test-corridor/wf1/marketplace`;
const authFile = authFileForRole(role);
const profileDir = profileDirForRole(role);
const browserChannel = process.env.HN_BROWSER_CHANNEL?.trim() || "chrome";

await ensureAuthDirectory(authFile);
await ensureDirectory(profileDir);

const readline = createInterface({ input, output });

const context = await chromium.launchPersistentContext(profileDir, {
channel: browserChannel,
headless: false,
slowMo: 80,
viewport: { width: 1440, height: 950 },
locale: "en-IN",
timezoneId: "Asia/Kolkata",
});

const existingPages = context.pages();
const page = existingPages.length > 0 ? existingPages[0] : await context.newPage();

try {
console.log("");
console.log("Opening test corridor auth capture browser.");
console.log(`Role: ${role}`);
console.log(`Expected email: ${expectedEmail}`);
console.log(`Browser channel: ${browserChannel}`);
console.log(`Automation Chrome profile: ${profileDir}`);
console.log(`Auth file will be saved to: ${authFile}`);
console.log("");

await page.goto(targetUrl, { waitUntil: "domcontentloaded" });

for (let attempt = 1; attempt <= 3; attempt += 1) {
await askHumanToLogin(readline, targetUrl, expectedEmail, browserChannel, profileDir);

await page.goto(targetUrl, { waitUntil: "domcontentloaded" });

const loggedOutWrongUser = await logoutIfWrongHandoverNowUser(page, targetUrl, expectedEmail);

if (loggedOutWrongUser) {
console.log("Wrong app user was logged out. Please login again with the expected account.");
continue;
}

const verification = await verifyTestCorridorState(page, expectedEmail);

if (verification.ok) {
await context.storageState({ path: authFile });

console.log("");
console.log("SUCCESS");
console.log(`Saved authenticated state for: ${expectedEmail}`);
console.log(`Saved file: ${authFile}`);
console.log("");
console.log("You can now close the browser window.");
console.log("");

await context.close();
readline.close();
return;
}

console.log("");
console.log(`Verification failed on attempt ${attempt} of 3.`);
console.log(`Detected HandoverNow email: ${verification.actualEmail ?? "none"}`);
console.log(`Has expected email: ${verification.hasExpectedEmail}`);
console.log(`Has TEST LANE: ${verification.hasTestLane}`);
console.log(`Has Published assets: ${verification.hasPublishedAssets}`);
console.log(`Current URL: ${page.url()}`);
console.log("");
console.log("Body preview:");
console.log(verification.bodyPreview);
console.log("");
}

throw new Error(`Could not capture authenticated state for ${expectedEmail} after 3 attempts.`);
} finally {
readline.close();

try {
await context.close();
} catch {
// Context may already be closed after success.
}
}
}

main().catch((error) => {
console.error("");
console.error("FAILED");
console.error(error);
console.error("");
process.exitCode = 1;
});
