import { chromium } from "@playwright/test";
import { access, mkdir, open } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const DEFAULT_TEST_BASE_URL = "https://cms.handovernow.com";

const ROLE_EMAILS = {
shudh: "shudh.datta@gmail.com",
raphael: "raphael.datta.2009@gmail.com",
};

const ROLE_PORTS = {
shudh: 9222,
raphael: 9223,
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

function logFileForRole(role) {
return resolve(process.cwd(), "playwright", ".logs", `chrome-cdp-${role}.log`);
}

async function ensureDirectory(path) {
await mkdir(path, { recursive: true });
}

async function ensureAuthDirectory(authFile) {
await mkdir(dirname(authFile), { recursive: true });
}

async function fileExists(path) {
try {
await access(path, fsConstants.F_OK);
return true;
} catch {
return false;
}
}

function commandPath(command) {
const result = spawnSync("bash", ["-lc", `command -v ${command}`], {
encoding: "utf8",
});

if (result.status !== 0) {
return null;
}

const trimmed = result.stdout.trim();

if (!trimmed) {
return null;
}

return trimmed.split("\n")[0];
}

function resolveChromePath() {
const explicit = process.env.HN_CHROME_PATH?.trim();

if (explicit) {
return explicit;
}

const candidates = [
"google-chrome",
"google-chrome-stable",
];

for (const candidate of candidates) {
const path = commandPath(candidate);

if (path) {
return path;
}
}

throw new Error(
[
"Could not find Google Chrome.",
"Install Chrome or set HN_CHROME_PATH=/path/to/google-chrome.",
"Do not use Chromium for Google OAuth; Google blocked it earlier.",
].join("\n"),
);
}

async function waitForCdp(port, timeoutMs) {
const startedAt = Date.now();
const url = `http://127.0.0.1:${port}/json/version`;
let lastError = null;

while (Date.now() - startedAt < timeoutMs) {
try {
const response = await fetch(url);

if (response.ok) {
const payload = await response.json().catch(() => null);

if (payload?.webSocketDebuggerUrl) {
return payload;
}
}
} catch (error) {
lastError = error;
}

await new Promise((resolve) => setTimeout(resolve, 500));
}

throw new Error(
[
`Chrome DevTools endpoint did not become ready on port ${port}.`,
`Checked URL: ${url}`,
`Last error: ${lastError instanceof Error ? lastError.message : String(lastError ?? "none")}`,
].join("\n"),
);
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

async function verifyTestCorridorState(page, expectedEmail) {
const actualEmail = await currentHandoverNowEmail(page);
const bodyText = await readBodyText(page);

const hasExpectedEmail = actualEmail === expectedEmail.toLowerCase();
const hasTestLane = bodyText.includes("TEST LANE");
const hasPublishedAssets = bodyText.includes("Published assets");
const hasLoginLink = bodyText.includes("Login");

return {
ok: hasExpectedEmail && hasTestLane && hasPublishedAssets,
actualEmail,
hasExpectedEmail,
hasTestLane,
hasPublishedAssets,
hasLoginLink,
bodyPreview: bodyText.slice(0, 900),
};
}

function printManualInstructions(targetUrl, expectedEmail, role, port, profileDir, logFile) {
console.log("");
console.log("Manual login window is opening.");
console.log("");
console.log(`Role: ${role}`);
console.log(`Expected account: ${expectedEmail}`);
console.log(`Target URL: ${targetUrl}`);
console.log(`CDP port: ${port}`);
console.log(`Chrome profile: ${profileDir}`);
console.log(`Chrome log file: ${logFile}`);
console.log("");
console.log("In the Chrome window:");
console.log(`1. Complete Cloudflare Access as ${expectedEmail}.`);
console.log("2. Enter the OTP manually.");
console.log("3. Click the HandoverNow Login link in the header.");
console.log(`4. Complete Google OAuth as ${expectedEmail}.`);
console.log(`5. Wait until the header says: Welcome ${expectedEmail}`);
console.log("6. Confirm the page shows TEST LANE and Published assets.");
console.log("");
console.log("When both logins are complete, return to this terminal and press ENTER.");
console.log("");
}

async function main() {
const role = normalizeRole(process.env.HN_AUTH_ROLE);
const expectedEmail = (process.env.HN_AUTH_EMAIL?.trim() || ROLE_EMAILS[role]).toLowerCase();
const baseUrl = normalizeBaseUrl(process.env.HN_TEST_BASE_URL);
const targetUrl = `${baseUrl}/test-corridor/wf1/marketplace`;
const port = Number(process.env.HN_CDP_PORT ?? ROLE_PORTS[role]);
const cdpUrl = `http://127.0.0.1:${port}`;
const authFile = authFileForRole(role);
const profileDir = profileDirForRole(role);
const logFile = logFileForRole(role);
const chromePath = resolveChromePath();

await ensureAuthDirectory(authFile);
await ensureDirectory(profileDir);
await ensureDirectory(dirname(logFile));

const logHandle = await open(logFile, "a");

console.log("");
console.log("HandoverNow test-corridor auth refresh");
console.log("");
console.log(`Using Chrome: ${chromePath}`);
console.log(`Chrome noisy stderr/stdout will go to: ${logFile}`);
console.log("");

const chromeArgs = [
`--remote-debugging-port=${port}`,
`--user-data-dir=${profileDir}`,
"--no-first-run",
"--no-default-browser-check",
"--log-level=3",
targetUrl,
];

const chrome = spawn(chromePath, chromeArgs, {
detached: false,
stdio: [
"ignore",
logHandle.fd,
logHandle.fd,
],
});

chrome.on("error", (error) => {
console.error("");
console.error("Chrome failed to launch.");
console.error(error);
console.error("");
});

await waitForCdp(port, 30_000);

printManualInstructions(targetUrl, expectedEmail, role, port, profileDir, logFile);

const readline = createInterface({ input, output });

try {
await readline.question("Press ENTER after Cloudflare Access and HandoverNow Google login are complete...");

console.log("");
console.log("Connecting to the logged-in Chrome window over CDP...");
console.log("");

const browser = await chromium.connectOverCDP(cdpUrl, {
timeout: 30_000,
isLocal: true,
});

try {
const contexts = browser.contexts();

if (contexts.length < 1) {
throw new Error("No Chrome browser contexts were found over CDP.");
}

const context = contexts[0];
const pages = context.pages();
const page = pages.find((candidate) => candidate.url().includes("cms.handovernow.com")) ?? pages[0] ?? await context.newPage();

await page.goto(targetUrl, { waitUntil: "domcontentloaded" });

const verification = await verifyTestCorridorState(page, expectedEmail);

if (!verification.ok) {
throw new Error(
[
"Login was not fully verified.",
`Expected email: ${expectedEmail}`,
`Detected HandoverNow email: ${verification.actualEmail ?? "none"}`,
`Has expected email: ${verification.hasExpectedEmail}`,
`Has TEST LANE: ${verification.hasTestLane}`,
`Has Published assets: ${verification.hasPublishedAssets}`,
`Page still shows Login text: ${verification.hasLoginLink}`,
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
console.log("The test runner can now reuse this file without showing Google OAuth.");
console.log("");

await browser.close().catch(() => undefined);
} finally {
await browser.close().catch(() => undefined);
}
} finally {
readline.close();
await logHandle.close().catch(() => undefined);

if (!chrome.killed) {
chrome.kill("SIGTERM");
}
}
}

main().catch((error) => {
console.error("");
console.error("FAILED");
console.error(error instanceof Error ? error.message : error);
console.error("");
process.exitCode = 1;
});
