Below is the **developer playbook Markdown file**. Copy this whole content into:

```text
demos/handovernow-cloudflare/docs/test-corridor-developer-playbook.md
```

I am writing it as a proper long-form developer document, not a tiny command note. It explains the purpose, the commands, the files, the scripts, how the code works, how the auth refresh works, what to run before full flow, and how Python developers should understand the Node/TypeScript/Playwright setup.

---

````md
# HandoverNow Test Corridor Developer Playbook

## Purpose of this document

This document explains how to run and maintain the HandoverNow production test-corridor automation.

The test corridor is a protected production-like lane under:

```text
https://cms.handovernow.com/test-corridor/wf1/marketplace
````

It exists so that we can safely test and demonstrate the real WF1 rental workflow on production infrastructure without exposing test assets in the public marketplace.

The immediate goal is not to build the entire full-flow demo in one jump. The immediate goal is to create a stable foundation:

1. Prove that the production test corridor is reachable.
2. Prove that Cloudflare Access login is valid.
3. Prove that HandoverNow Google OAuth login is valid.
4. Prove that Shudh can enter the corridor as the owner/operator user.
5. Prove that Raphael can enter the corridor as the tenant/applicant user.
6. Prove that the basic pages and API work before running a long workflow.
7. Make stale-login failures obvious and easy to fix.
8. Keep the demo stable by avoiding direct automated Google OAuth login.

The full two-person owner/tenant workflow should only be built and run after the fundamentals pass for both users.

---

## Audience

This document is written for a mixed team.

Some developers are TypeScript/Node developers.

Some developers are Python developers who may not regularly use:

```text
pnpm
package.json scripts
Playwright storageState
Chrome remote debugging
Node .mjs scripts
```

For Python developers, the closest mental model is:

```text
Node.js                  ~= Python runtime
node file.mjs            ~= python file.py
pnpm                     ~= pip/poetry/npm-style package manager
pnpm run <script-name>   ~= make <target> or poetry run <named script>
package.json scripts     ~= Makefile targets / pyproject task entries
Playwright browser       ~= Selenium/Playwright browser instance
Browser context          ~= isolated browser profile/session
storageState JSON        ~= saved cookies + local storage
```

The test-corridor scripts are written in JavaScript/TypeScript style because the HandoverNow Cloudflare demo is an Astro/TypeScript app and already uses Playwright from the Node workspace.

---

## Repository and folder

All commands in this document assume the developer is inside the Cloudflare demo folder.

Start here:

```bash
cd ~/PycharmProjects/emdash-experiments/demos/handovernow-cloudflare
```

Check:

```bash
pwd
```

Expected output:

```text
/home/shudh/PycharmProjects/emdash-experiments/demos/handovernow-cloudflare
```

Do not run these commands from the monorepo root unless the command explicitly says so.

The branch used for this work is:

```text
feat/wf1-chatbotify-test-corridor
```

Check:

```bash
git branch --show-current
```

Expected:

```text
feat/wf1-chatbotify-test-corridor
```

---

## Production test corridor

The production test corridor URL is:

```text
https://cms.handovernow.com/test-corridor/wf1/marketplace
```

This page is not the public marketplace.

This page is a protected test lane.

The test lane is expected to show:

```text
TEST LANE
Published assets
```

The HandoverNow header should show the logged-in app user after Google OAuth login:

```text
Welcome shudh.datta@gmail.com
```

or:

```text
Welcome raphael.datta.2009@gmail.com
```

If the page shows `Login`, the HandoverNow app session is missing or stale.

If the page shows Cloudflare Access, the Cloudflare Access session is missing or stale.

The automation must distinguish these two failures clearly.

---

## Why there are two login gates

The production test corridor is behind two different login systems.

### Gate 1: Cloudflare Access

Cloudflare Access protects the test corridor at the infrastructure edge.

This is the first login screen.

The user enters an allowed email address, receives an OTP, and completes Access authentication.

Allowed test emails:

```text
shudh.datta@gmail.com
raphael.datta.2009@gmail.com
```

If Cloudflare Access is stale, the browser will not reach the HandoverNow app page. It will be stopped by Cloudflare.

### Gate 2: HandoverNow Google OAuth

After Cloudflare allows access to the site, HandoverNow still needs its own app session.

This happens through the `Login` link in the HandoverNow header.

The user clicks `Login`, completes Google OAuth, and returns to the test corridor.

After successful HandoverNow login, the header should show:

```text
Welcome <email>
```

For Shudh:

```text
Welcome shudh.datta@gmail.com
```

For Raphael:

```text
Welcome raphael.datta.2009@gmail.com
```

This second login is separate from Cloudflare Access.

A developer may pass Cloudflare Access but still be logged out of HandoverNow.

The scripts must check both gates.

---

## Why Google OAuth is not directly automated

Google blocks many browser sessions launched directly by automation tools.

When we tried to let Playwright launch Chromium or Chrome and complete Google OAuth, Google showed:

```text
Couldn't sign you in
This browser or app may not be secure
```

Even when using branded Google Chrome through Playwright, the browser showed:

```text
Chrome is being controlled by automated test software
```

Google still blocked the OAuth login.

Therefore, the stable approach is:

1. Open normal Google Chrome with remote debugging enabled.
2. Let the human complete Cloudflare Access manually.
3. Let the human complete Google OAuth manually.
4. After login succeeds, Playwright connects to that already-open Chrome over CDP.
5. Playwright saves cookies and local storage to a `storageState` JSON file.
6. Later tests reuse that saved state without repeating OAuth.

This is not bypassing security.

This is a controlled human-in-the-loop auth capture.

It is exactly what we want for a protected demo environment.

---

## Local sensitive files

The scripts create and use the following local-only folders.

### Auth state folder

```text
playwright/.auth
```

This stores saved browser state.

Example files:

```text
playwright/.auth/test-corridor-shudh.json
playwright/.auth/test-corridor-raphael.json
```

These files contain cookies and local storage.

They may allow impersonation of a logged-in user.

They must not be committed.

### Chrome profile folder

```text
playwright/.profiles
```

This stores temporary Chrome user-data directories used during manual auth capture.

Example:

```text
playwright/.profiles/test-corridor-shudh-manual
playwright/.profiles/test-corridor-raphael-manual
```

These are not daily Chrome profiles.

They are automation-specific profiles.

They must not be committed.

### Chrome logs folder

```text
playwright/.logs
```

This stores noisy Chrome logs.

Example:

```text
playwright/.logs/chrome-cdp-shudh.log
playwright/.logs/chrome-cdp-raphael.log
```

Chrome may print internal messages like:

```text
VAAPI version is too old
GCM registration DEPRECATED_ENDPOINT
TensorFlow Lite XNNPACK delegate
Vulkan adapter warnings
```

These are not HandoverNow failures.

They are Chrome internal noise.

The auth-refresh script redirects them to log files so the demo terminal stays clean.

---

## Required `.gitignore` entries

The file:

```text
demos/handovernow-cloudflare/.gitignore
```

should contain:

```gitignore
db/*.db
db/*.db-shm
db/*.db-wal
.local/
.tmp/
test-results/
playwright-report/
.astro/
dist/
.wrangler/
uploads/
docs/generated/
playwright/.auth
playwright/.profiles
playwright/.logs
```

The important entries for this playbook are:

```gitignore
playwright/.auth
playwright/.profiles
playwright/.logs
```

Check ignored status:

```bash
git status --ignored -s playwright/.auth playwright/.profiles playwright/.logs
```

Expected output should show ignored folders with `!!`, for example:

```text
!! playwright/.auth/
!! playwright/.profiles/
!! playwright/.logs/
```

If Git shows these files as normal untracked files, stop and fix `.gitignore` before proceeding.

---

## What `pnpm run` means

The Cloudflare demo is a Node package.

Its package file is:

```text
demos/handovernow-cloudflare/package.json
```

Inside that file there is a `scripts` section.

Example:

```json
{
  "scripts": {
    "typecheck:d1-cloud": "astro check",
    "corridor:auth:shudh": "HN_TEST_BASE_URL=https://cms.handovernow.com HN_AUTH_ROLE=shudh HN_AUTH_EMAIL=shudh.datta@gmail.com node scripts/test-corridor-auth-refresh.mjs"
  }
}
```

When we run:

```bash
pnpm run corridor:auth:shudh
```

pnpm looks inside `package.json`, finds the script named `corridor:auth:shudh`, and runs the command string.

For Python developers, this is like a Makefile target:

```makefile
corridor-auth-shudh:
    HN_TEST_BASE_URL=... node scripts/test-corridor-auth-refresh.mjs
```

or a Poetry task.

The command name is only a shortcut.

It does not hide any magic.

---

## Required package scripts

The following scripts should exist in:

```text
demos/handovernow-cloudflare/package.json
```

Under the `"scripts"` object, add or verify these entries:

```json
{
  "scripts": {
    "dev": "astro dev",
    "dev:local-db": "HANDOVERNOW_DB_TARGET=local astro dev",
    "dev:d1-cloud": "astro dev",
    "build": "astro build",
    "build:local-db": "HANDOVERNOW_DB_TARGET=local astro build",
    "build:d1-cloud": "astro build",
    "build:all": "pnpm run --filter @handovernow/cms-cloudflare... build",
    "preview": "astro preview",
    "deploy": "pnpm build:all && wrangler deploy",
    "deploy:d1-cloud": "pnpm build:d1-cloud && wrangler deploy",
    "db:reset:remote": "./scripts/reset-db.sh",
    "typecheck": "astro check",
    "typecheck:local-db": "HANDOVERNOW_DB_TARGET=local astro check",
    "typecheck:d1-cloud": "astro check",
    "corridor:auth:shudh": "HN_TEST_BASE_URL=https://cms.handovernow.com HN_AUTH_ROLE=shudh HN_AUTH_EMAIL=shudh.datta@gmail.com node scripts/test-corridor-auth-refresh.mjs",
    "corridor:auth:raphael": "HN_TEST_BASE_URL=https://cms.handovernow.com HN_AUTH_ROLE=raphael HN_AUTH_EMAIL=raphael.datta.2009@gmail.com node scripts/test-corridor-auth-refresh.mjs",
    "corridor:check:shudh": "HN_TEST_BASE_URL=https://cms.handovernow.com HN_AUTH_ROLE=shudh HN_AUTH_EMAIL=shudh.datta@gmail.com node scripts/test-corridor-fundamentals.mjs",
    "corridor:check:raphael": "HN_TEST_BASE_URL=https://cms.handovernow.com HN_AUTH_ROLE=raphael HN_AUTH_EMAIL=raphael.datta.2009@gmail.com node scripts/test-corridor-fundamentals.mjs",
    "corridor:check:shudh:headless": "HN_TEST_BASE_URL=https://cms.handovernow.com HN_AUTH_ROLE=shudh HN_AUTH_EMAIL=shudh.datta@gmail.com HN_HEADLESS=1 node scripts/test-corridor-fundamentals.mjs",
    "corridor:check:raphael:headless": "HN_TEST_BASE_URL=https://cms.handovernow.com HN_AUTH_ROLE=raphael HN_AUTH_EMAIL=raphael.datta.2009@gmail.com HN_HEADLESS=1 node scripts/test-corridor-fundamentals.mjs"
  }
}
```

Do not blindly replace the whole `package.json`.

Only add these new `corridor:*` scripts to the existing `"scripts"` block.

The important commands are:

```bash
pnpm run corridor:auth:shudh
pnpm run corridor:auth:raphael
pnpm run corridor:check:shudh
pnpm run corridor:check:raphael
```

The `headless` variants are optional later.

During development and demo preparation, prefer headed checks.

---

## Script 1: auth refresh script

File:

```text
scripts/test-corridor-auth-refresh.mjs
```

Purpose:

This script refreshes the saved login state for one user.

It opens normal Google Chrome, lets the human complete both login gates, connects to Chrome over CDP, verifies the page, and saves cookies/local storage to a Playwright auth JSON file.

It is used when the auth state file is missing or stale.

Run for Shudh:

```bash
pnpm run corridor:auth:shudh
```

Run for Raphael:

```bash
pnpm run corridor:auth:raphael
```

---

## Full code: `scripts/test-corridor-auth-refresh.mjs`

Copy this into:

```text
demos/handovernow-cloudflare/scripts/test-corridor-auth-refresh.mjs
```

```js
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

		await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
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

	let browser = null;

	try {
		await readline.question("Press ENTER after Cloudflare Access and HandoverNow Google login are complete...");

		console.log("");
		console.log("Connecting to the logged-in Chrome window over CDP...");
		console.log("");

		browser = await chromium.connectOverCDP(cdpUrl, {
			timeout: 30_000,
			isLocal: true,
		});

		const contexts = browser.contexts();

		if (contexts.length < 1) {
			throw new Error("No Chrome browser contexts were found over CDP.");
		}

		const context = contexts[0];
		const pages = context.pages();
		const page =
			pages.find((candidate) => candidate.url().includes("cms.handovernow.com")) ??
			pages[0] ??
			await context.newPage();

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
	} finally {
		readline.close();

		if (browser !== null) {
			await browser.close().catch(() => undefined);
		}

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
```

---

## How the auth refresh script works

This section explains the script block by block.

### Imports

```js
import { chromium } from "@playwright/test";
import { access, mkdir, open } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
```

Meaning:

`chromium` gives us Playwright's browser automation API.

We are not using Playwright Test's `test(...)` function here.

This is a plain Node script.

This matters because earlier `test(...)` caused a Playwright runner error.

`fs/promises` is used to create folders and open log files.

`path` is used to build safe absolute paths.

`child_process` is used to launch real Google Chrome.

`readline/promises` is used to pause the terminal until the human presses ENTER.

### Constants

```js
const DEFAULT_TEST_BASE_URL = "https://cms.handovernow.com";
```

This is the production CMS host.

The final URL becomes:

```text
https://cms.handovernow.com/test-corridor/wf1/marketplace
```

```js
const ROLE_EMAILS = {
	shudh: "shudh.datta@gmail.com",
	raphael: "raphael.datta.2009@gmail.com",
};
```

This maps short role names to real Google/HandoverNow emails.

```js
const ROLE_PORTS = {
	shudh: 9222,
	raphael: 9223,
};
```

Each role gets a separate Chrome remote debugging port.

This prevents Shudh and Raphael Chrome sessions from colliding.

### Role normalization

```js
function normalizeRole(value) {
	const rawValue = value?.trim().toLowerCase();

	if (rawValue === "raphael") {
		return "raphael";
	}

	return "shudh";
}
```

This lets the script accept:

```bash
HN_AUTH_ROLE=shudh
```

or:

```bash
HN_AUTH_ROLE=raphael
```

If no role is given, it defaults to `shudh`.

### Base URL normalization

```js
function normalizeBaseUrl(value) {
	const rawValue = value?.trim() || DEFAULT_TEST_BASE_URL;
	return rawValue.replace(/\/+$/, "");
}
```

This removes trailing slashes.

Both of these become the same:

```text
https://cms.handovernow.com
https://cms.handovernow.com/
```

This prevents malformed URLs such as:

```text
https://cms.handovernow.com//test-corridor/wf1/marketplace
```

### Auth file path

```js
function authFileForRole(role) {
	return resolve(process.cwd(), "playwright", ".auth", `test-corridor-${role}.json`);
}
```

If the current folder is:

```text
demos/handovernow-cloudflare
```

then for Shudh this returns:

```text
demos/handovernow-cloudflare/playwright/.auth/test-corridor-shudh.json
```

For Raphael:

```text
demos/handovernow-cloudflare/playwright/.auth/test-corridor-raphael.json
```

### Chrome profile path

```js
function profileDirForRole(role) {
	return resolve(process.cwd(), "playwright", ".profiles", `test-corridor-${role}-manual`);
}
```

This gives each role a separate Chrome profile directory.

This is important because Shudh and Raphael are different Google accounts.

We should not mix their cookies.

### Chrome log file path

```js
function logFileForRole(role) {
	return resolve(process.cwd(), "playwright", ".logs", `chrome-cdp-${role}.log`);
}
```

Chrome writes noisy internal warnings.

We redirect those messages into files such as:

```text
playwright/.logs/chrome-cdp-shudh.log
```

This keeps the terminal readable during demos.

### Directory creation

```js
async function ensureDirectory(path) {
	await mkdir(path, { recursive: true });
}
```

This is equivalent to:

```bash
mkdir -p <path>
```

It creates the folder if missing.

It does nothing bad if the folder already exists.

### Checking Chrome location

```js
function commandPath(command) {
	const result = spawnSync("bash", ["-lc", `command -v ${command}`], {
		encoding: "utf8",
	});
```

This asks the shell:

```bash
command -v google-chrome
```

or:

```bash
command -v google-chrome-stable
```

It returns the full path to Chrome if installed.

### Chrome path resolution

```js
function resolveChromePath() {
	const explicit = process.env.HN_CHROME_PATH?.trim();

	if (explicit) {
		return explicit;
	}
```

A developer may override Chrome path with:

```bash
HN_CHROME_PATH=/custom/path/google-chrome pnpm run corridor:auth:shudh
```

If not set, the script tries:

```text
google-chrome
google-chrome-stable
```

If neither exists, the script fails clearly.

### Waiting for Chrome CDP

```js
async function waitForCdp(port, timeoutMs) {
	const startedAt = Date.now();
	const url = `http://127.0.0.1:${port}/json/version`;
```

When Chrome is launched with:

```bash
--remote-debugging-port=9222
```

it exposes a local HTTP endpoint:

```text
http://127.0.0.1:9222/json/version
```

The script polls that endpoint until Chrome is ready.

If Chrome does not become ready in 30 seconds, the script fails.

### Reading page text

```js
async function readBodyText(page) {
	try {
		return await page.locator("body").innerText({ timeout: 10_000 });
	} catch {
		return "";
	}
}
```

This reads all visible text from the page body.

It is used to detect:

```text
TEST LANE
Published assets
Login
```

### Detecting logged-in HandoverNow user

```js
async function currentHandoverNowEmail(page) {
	const account = page.locator(".wf1-account").first();
```

The HandoverNow header renders this after login:

```text
Welcome shudh.datta@gmail.com
```

The `.wf1-account` element contains that text.

The script extracts the email using:

```js
const match = text.match(/Welcome\s+(.+?)\s*$/i);
```

If the header says:

```text
Welcome shudh.datta@gmail.com
```

the function returns:

```text
shudh.datta@gmail.com
```

If the user is not logged in, it returns `null`.

### Verifying test corridor state

```js
async function verifyTestCorridorState(page, expectedEmail) {
	const actualEmail = await currentHandoverNowEmail(page);
	const bodyText = await readBodyText(page);

	const hasExpectedEmail = actualEmail === expectedEmail.toLowerCase();
	const hasTestLane = bodyText.includes("TEST LANE");
	const hasPublishedAssets = bodyText.includes("Published assets");
	const hasLoginLink = bodyText.includes("Login");
```

This is the central verification.

It checks:

```text
actual logged-in email == expected email
page contains TEST LANE
page contains Published assets
```

The state is valid only if all are true.

The script does not just trust that Chrome opened.

It verifies the actual app state.

### Printing manual instructions

```js
function printManualInstructions(targetUrl, expectedEmail, role, port, profileDir, logFile) {
```

This prints what the human must do.

It makes the script useful for Python developers and non-Node developers.

It tells them:

```text
which account to use
which URL is opened
which Chrome profile is used
where logs are going
when to press ENTER
```

### Main function

```js
async function main() {
	const role = normalizeRole(process.env.HN_AUTH_ROLE);
```

The main function reads environment variables.

For Shudh:

```bash
HN_AUTH_ROLE=shudh
HN_AUTH_EMAIL=shudh.datta@gmail.com
```

For Raphael:

```bash
HN_AUTH_ROLE=raphael
HN_AUTH_EMAIL=raphael.datta.2009@gmail.com
```

The script constructs:

```text
target URL
CDP port
auth file path
profile directory
log file path
Chrome path
```

### Launching Chrome

```js
const chrome = spawn(chromePath, chromeArgs, {
	detached: false,
	stdio: [
		"ignore",
		logHandle.fd,
		logHandle.fd,
	],
});
```

This opens normal Google Chrome.

Important Chrome arguments:

```js
`--remote-debugging-port=${port}`
```

This enables Playwright to attach later.

```js
`--user-data-dir=${profileDir}`
```

This uses a separate automation profile.

```js
"--no-first-run"
"--no-default-browser-check"
```

These reduce first-run prompts.

```js
"--log-level=3"
```

This reduces Chrome log noise.

The `stdio` block sends Chrome logs to the log file instead of terminal.

### Waiting for manual login

```js
await readline.question("Press ENTER after Cloudflare Access and HandoverNow Google login are complete...");
```

The script pauses.

The human completes both login gates.

After the human presses ENTER, the script continues.

### Attaching over CDP

```js
browser = await chromium.connectOverCDP(cdpUrl, {
	timeout: 30_000,
	isLocal: true,
});
```

This connects Playwright to the already-open Chrome.

This avoids Google's “automated browser” block because Google login already happened manually in normal Chrome.

### Saving auth state

```js
await context.storageState({ path: authFile });
```

This writes cookies and local storage into:

```text
playwright/.auth/test-corridor-shudh.json
```

or:

```text
playwright/.auth/test-corridor-raphael.json
```

Later tests use this file to start already logged in.

---

## Script 2: fundamentals check

File:

```text
scripts/test-corridor-fundamentals.mjs
```

Purpose:

This script uses a saved auth state file and checks that the production test corridor still works.

It does not perform Google OAuth.

It does not ask for OTP.

It does not create records.

It only verifies the foundation.

Run for Shudh:

```bash
pnpm run corridor:check:shudh
```

Run for Raphael:

```bash
pnpm run corridor:check:raphael
```

---

## Full code: `scripts/test-corridor-fundamentals.mjs`

Copy this into:

```text
demos/handovernow-cloudflare/scripts/test-corridor-fundamentals.mjs
```

```js
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
	console.log("Or use the package script:");
	console.log("");
	console.log(`pnpm run corridor:auth:${role}`);
	console.log("");
	console.log("What it will do:");
	console.log("1. Open a normal Google Chrome window.");
	console.log("2. Send Chrome internal logs to playwright/.logs instead of polluting the terminal.");
	console.log("3. Let you manually complete Cloudflare Access OTP.");
	console.log("4. Let you manually complete HandoverNow Google OAuth.");
	console.log("5. Verify TEST LANE, Published assets, and Welcome email.");
	console.log("6. Save the fresh cookies to playwright/.auth.");
	console.log("");
	console.log("After it succeeds, rerun this fundamentals test:");
	console.log("");
	console.log(`pnpm run corridor:check:${role}`);
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
		console.log("- HandoverNow app session is the expected user");
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
```

---

## How the fundamentals script works

This script is a preflight test.

It does not create data.

It does not submit forms.

It does not run the full workflow.

Its job is to stop us early if the test-corridor foundation is broken.

### Imports

```js
import { chromium } from "@playwright/test";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
```

`chromium` opens a browser.

`access` checks whether a file exists.

`resolve` builds absolute paths.

### Role and URL setup

```js
const DEFAULT_TEST_BASE_URL = "https://cms.handovernow.com";

const ROLE_EMAILS = {
	shudh: "shudh.datta@gmail.com",
	raphael: "raphael.datta.2009@gmail.com",
};
```

The script supports two role names:

```text
shudh
raphael
```

It expects the matching email in the HandoverNow header.

### Auth file lookup

```js
function authFileForRole(role) {
	return resolve(process.cwd(), "playwright", ".auth", `test-corridor-${role}.json`);
}
```

For Shudh:

```text
playwright/.auth/test-corridor-shudh.json
```

For Raphael:

```text
playwright/.auth/test-corridor-raphael.json
```

### Missing auth detection

```js
if (!(await fileExists(authFile))) {
	printAuthRefreshInstructions(role, expectedEmail, baseUrl);
	fail(`Auth state file does not exist: ${authFile}`);
}
```

If the auth file does not exist, the script prints the exact refresh command.

For Shudh:

```bash
pnpm run corridor:auth:shudh
```

For Raphael:

```bash
pnpm run corridor:auth:raphael
```

This is deliberate.

The full flow must not continue without valid auth.

### Browser launch

```js
const browser = await chromium.launch({
	headless,
	slowMo,
});
```

The browser is headed by default.

Headed means visible.

We prefer headed for demos because the browser itself becomes part of the explanation.

Set:

```bash
HN_HEADLESS=1
```

only for faster non-demo checks.

### Browser context with saved auth

```js
const context = await browser.newContext({
	storageState: authFile,
	viewport: { width: 1440, height: 950 },
	locale: "en-IN",
	timezoneId: "Asia/Kolkata",
});
```

This is the key Playwright feature.

The context loads cookies and local storage from the saved auth file.

The browser starts already logged in if the cookies are still valid.

The context is isolated from other contexts.

For Python developers:

```text
browser.newContext({ storageState: authFile })
```

is like creating a new Selenium/browser profile preloaded with cookies.

### Opening marketplace

```js
const response = await page.goto(marketplaceUrl, { waitUntil: "domcontentloaded" });
```

The test opens:

```text
https://cms.handovernow.com/test-corridor/wf1/marketplace
```

### Checking no-store/noindex headers

```js
await checkTestHeaders(response);
```

The test corridor should not be cached or indexed.

This check is helpful but non-fatal in the current script.

If headers are missing, it prints a warning.

It does not immediately fail because the page-level verification is more important for the first stage.

### Checking auth

```js
await checkAuthOrExplain(page, role, expectedEmail, baseUrl);
```

This detects the two stale-auth cases.

Cloudflare stale:

```text
Cloudflare Access login is required again.
```

HandoverNow stale:

```text
Header still shows Login.
```

Wrong user:

```text
Expected shudh.datta@gmail.com; detected raphael.datta.2009@gmail.com
```

In all cases, the script prints the refresh command.

### Checking test-lane identity

```js
await expectBodyContains(page, "TEST LANE", "Marketplace shows TEST LANE");
```

This proves we are not testing the public marketplace.

### Checking marketplace render

```js
await expectBodyContains(page, "Published assets", "Marketplace shows Published assets");
```

This proves the marketplace page rendered.

### Checking route correctness

```js
await expectUrlIncludes(page, "/test-corridor/wf1/marketplace", "Marketplace URL is under test corridor");
```

This prevents accidental drift back to:

```text
/wf1
```

or:

```text
/wf/
```

### Checking bad links

```js
await expectNoBadLinks(page);
```

This checks for:

```text
a[href^="/wf/"]
a[href*="/test-corridor/test-corridor"]
```

These are two classes of routing bugs we already saw or anticipated.

### Checking API

```js
await checkMarketplaceApi(page);
```

This calls the browser-side API:

```text
/test-corridor/api/wf1-rental/marketplace/assets
```

It verifies:

```json
{
  "ok": true,
  "data": {
    "items": []
  }
}
```

or an equivalent `items` array with test-lane assets.

This confirms that the authenticated browser can call the test-corridor API.

### Clicking Available flats

```js
await page.getByRole("link", { name: /^Available flats$/ }).click();
```

This verifies header navigation.

It must stay inside:

```text
/test-corridor/wf1/marketplace
```

### Opening first asset if present

```js
await maybeOpenFirstAsset(page);
```

If test-lane marketplace has assets, it opens the first one.

If there are no assets, it prints a note and continues.

This keeps the fundamentals check useful even on a clean database.

### Owner dashboard

```js
await page.getByRole("link", { name: /^Owner$/ }).click();
```

This verifies that the logged-in user can open the owner dashboard.

It checks:

```text
TEST LANE
Dashboard
```

### Create asset page

```js
await page.getByRole("link", { name: /^List asset$/ }).click();
```

This verifies the create asset screen.

It checks:

```text
TEST LANE
Create draft asset
Asset config items
```

Then it checks key controls:

```js
#title
#publicPrice
input[name="publish"]
```

This proves the page is ready for the later full flow.

---

## Normal daily run order before full-flow development

Before running or developing the full owner/tenant flow, run this sequence.

### 1. Enter the right folder

```bash
cd ~/PycharmProjects/emdash-experiments/demos/handovernow-cloudflare
```

### 2. Check TypeScript/Astro

```bash
pnpm run typecheck:d1-cloud
```

This catches TypeScript and Astro integration errors.

If this fails, do not run E2E.

Fix type errors first.

### 3. Run WF1 Vitest tests

```bash
pnpm exec vitest run tests/wf1
```

This checks:

```text
workflow definitions
commands
projection logic
schema expectations
API handler logic
```

If this fails, do not run full E2E.

Fix domain logic first.

### 4. Run local Playwright smoke

```bash
pnpm exec playwright test -c e2e/playwright.d1-cloud.config.ts
```

This checks the local `/wf1` shell and marketplace smoke path.

This is not the production test corridor.

It verifies that the local app can boot and serve core WF1 pages.

### 5. Check Shudh production corridor

```bash
pnpm run corridor:check:shudh
```

If stale, refresh:

```bash
pnpm run corridor:auth:shudh
pnpm run corridor:check:shudh
```

### 6. Check Raphael production corridor

```bash
pnpm run corridor:check:raphael
```

If stale, refresh:

```bash
pnpm run corridor:auth:raphael
pnpm run corridor:check:raphael
```

### 7. Only then run full flow

The future full flow should only run after:

```bash
pnpm run typecheck:d1-cloud
pnpm exec vitest run tests/wf1
pnpm exec playwright test -c e2e/playwright.d1-cloud.config.ts
pnpm run corridor:check:shudh
pnpm run corridor:check:raphael
```

This is the readiness gate.

If any of these fails, the full flow is not trusted.

---

## Demo-day runbook

On demo day, do not begin by running the long workflow.

First run:

```bash
cd ~/PycharmProjects/emdash-experiments/demos/handovernow-cloudflare
```

Then:

```bash
pnpm run corridor:check:shudh
pnpm run corridor:check:raphael
```

If both pass, proceed to the full demo.

If Shudh fails:

```bash
pnpm run corridor:auth:shudh
pnpm run corridor:check:shudh
```

If Raphael fails:

```bash
pnpm run corridor:auth:raphael
pnpm run corridor:check:raphael
```

This avoids public demo failure because of stale cookies.

The full flow should never be the first command run on demo day.

---

## Meaning of each corridor command

### `pnpm run corridor:auth:shudh`

Refreshes Shudh's saved login state.

Use when:

```text
test-corridor-shudh.json is missing
Cloudflare Access session expired
HandoverNow login expired
wrong account was detected
```

What happens:

1. Normal Chrome opens.
2. Developer completes Cloudflare Access as Shudh.
3. Developer completes Google OAuth as Shudh.
4. Script verifies header says `Welcome shudh.datta@gmail.com`.
5. Script saves `playwright/.auth/test-corridor-shudh.json`.

### `pnpm run corridor:auth:raphael`

Same as above, but for Raphael.

It saves:

```text
playwright/.auth/test-corridor-raphael.json
```

### `pnpm run corridor:check:shudh`

Runs fundamentals check using Shudh's saved auth file.

It does not login.

It verifies the saved login is still valid.

### `pnpm run corridor:check:raphael`

Runs fundamentals check using Raphael's saved auth file.

It does not login.

It verifies the saved login is still valid.

### `pnpm run corridor:check:shudh:headless`

Same as Shudh check, but hidden browser.

Use only after the headed version is stable.

### `pnpm run corridor:check:raphael:headless`

Same as Raphael check, but hidden browser.

Use only after the headed version is stable.

---

## Troubleshooting

### Problem: Google says browser is not secure

Symptom:

```text
Couldn't sign you in
This browser or app may not be secure
```

Cause:

Google blocked OAuth in a Playwright-launched automated browser.

Fix:

Do not use Playwright-launched OAuth.

Use:

```bash
pnpm run corridor:auth:shudh
```

or:

```bash
pnpm run corridor:auth:raphael
```

These use normal Chrome with CDP capture.

### Problem: Chrome prints VAAPI/GCM/TensorFlow/Vulkan warnings

Symptom:

```text
VAAPI version is too old
Registration response error message: DEPRECATED_ENDPOINT
Created TensorFlow Lite XNNPACK delegate for CPU
Vulkan adapter warning
```

Cause:

Chrome internal noise.

Fix:

Ignore these unless the browser fails to open.

The auth-refresh script redirects these logs to:

```text
playwright/.logs/
```

### Problem: check says auth file does not exist

Symptom:

```text
Auth state file does not exist
```

Fix for Shudh:

```bash
pnpm run corridor:auth:shudh
pnpm run corridor:check:shudh
```

Fix for Raphael:

```bash
pnpm run corridor:auth:raphael
pnpm run corridor:check:raphael
```

### Problem: check says Cloudflare Access login is required

Cause:

Cloudflare Access cookies expired.

Fix:

Run the auth refresh command for that user.

### Problem: check says HandoverNow app login is missing

Cause:

Cloudflare Access passed, but HandoverNow OAuth session expired.

Fix:

Run the auth refresh command for that user.

### Problem: check detects wrong email

Cause:

The saved auth file belongs to the wrong Google/HandoverNow account.

Fix:

Refresh the correct role.

For Shudh:

```bash
pnpm run corridor:auth:shudh
```

For Raphael:

```bash
pnpm run corridor:auth:raphael
```

### Problem: port 9222 is already in use

Shudh uses CDP port:

```text
9222
```

Raphael uses:

```text
9223
```

If port is occupied, find the process:

```bash
lsof -i :9222
```

or:

```bash
lsof -i :9223
```

Kill the stale process if needed:

```bash
kill <PID>
```

Then rerun the auth command.

---

## Why the fundamentals check does not create an asset

The fundamentals check intentionally avoids creating records.

It is a foundation check.

It answers:

```text
Can this user enter the test corridor?
Can this user call the test-corridor API?
Can this user see marketplace?
Can this user see owner dashboard?
Can this user reach create asset page?
```

It does not answer:

```text
Can owner create asset?
Can owner publish asset?
Can tenant apply?
Can owner review tenant?
Can workflow state advance?
```

Those belong to the next full-flow script.

Keeping fundamentals read-only makes it safe to run many times.

---

## Future full-flow automation design

After the fundamentals pass for both users, the next script should open two browser contexts.

### Owner context

```text
Role: Shudh
Auth file: playwright/.auth/test-corridor-shudh.json
Purpose: owner/admin/operator actions
```

### Tenant context

```text
Role: Raphael
Auth file: playwright/.auth/test-corridor-raphael.json
Purpose: tenant/applicant actions
```

The full flow should create a unique run id:

```text
HN Demo Flat 2026-06-11 12-45-30
```

Then it should use that run id in every check.

The flow should be deterministic:

1. Shudh opens owner dashboard.
2. Shudh opens create asset.
3. Shudh creates a test asset.
4. Shudh publishes it to test marketplace.
5. Raphael opens test marketplace.
6. Raphael finds the exact run-id asset.
7. Raphael opens asset detail.
8. Raphael completes prescreen/apply flow.
9. Shudh opens owner dashboard again.
10. Shudh sees Raphael's application.
11. Shudh opens workspace.
12. Shudh performs the owner-side workflow step.
13. Raphael sees the updated workspace state.

Do not use AI to decide critical clicks in the golden path.

AI may generate narration.

AI may generate a report.

AI may assist after a failure.

But the demo-critical actions should be deterministic Playwright actions.

---

## Future demo/video system

The recommended future stack is:

```text
Playwright deterministic script
  -> full owner/tenant flow correctness

Director scene layer
  -> human-readable sequence of scenes

Argo
  -> narration, TTS, timing, captions, final video

Optional AI SDK
  -> generate narration or conversational wrapper

Optional Stagehand
  -> exploratory UI assistance, not golden path

Optional LangGraph
  -> long-running human-in-loop agent later
```

The important rule:

```text
The live demo path must be deterministic.
```

AI can narrate.

AI can explain.

AI can suggest.

AI should not be responsible for the button clicks that make or break the demo.

---

## Minimum checklist before proceeding to full flow

Before writing or running the full owner/tenant flow, confirm:

```bash
cd ~/PycharmProjects/emdash-experiments/demos/handovernow-cloudflare
```

```bash
pnpm run typecheck:d1-cloud
```

```bash
pnpm exec vitest run tests/wf1
```

```bash
pnpm exec playwright test -c e2e/playwright.d1-cloud.config.ts
```

```bash
pnpm run corridor:check:shudh
```

```bash
pnpm run corridor:check:raphael
```

Expected:

All pass.

If either user check fails, refresh that user first.

Do not proceed to full flow with stale auth.

---

## Commit hygiene

Before committing, check:

```bash
git status
```

Files that may be committed:

```text
scripts/test-corridor-auth-refresh.mjs
scripts/test-corridor-fundamentals.mjs
docs/test-corridor-developer-playbook.md
package.json
.gitignore
```

Files that must not be committed:

```text
playwright/.auth/*
playwright/.profiles/*
playwright/.logs/*
```

Check ignored files:

```bash
git status --ignored -s playwright/.auth playwright/.profiles playwright/.logs
```

Expected:

```text
!! playwright/.auth/
!! playwright/.profiles/
!! playwright/.logs/
```

If auth/profile/log files appear as untracked without `!!`, fix `.gitignore`.

---

## Summary

The test corridor is production-like and protected.

There are two login gates:

```text
Cloudflare Access
HandoverNow Google OAuth
```

Google OAuth cannot be reliably automated directly.

The stable method is:

```text
manual Chrome login
CDP attach
storageState save
deterministic Playwright checks
```

The current foundation is:

```text
pnpm run corridor:auth:shudh
pnpm run corridor:check:shudh
pnpm run corridor:auth:raphael
pnpm run corridor:check:raphael
```

The full workflow demo should only be built after both users pass fundamentals.

The final live demo should be:

```text
headed
deterministic
clear in terminal
clear in browser
auth prechecked
no surprise OAuth
no AI-controlled golden clicks
```

```

That is the document I would put in the repo before touching the full-flow script.
```
