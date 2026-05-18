import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { RENTAL_LOCAL_USERS } from "../rental-local-users.js";
import {
	createWorkflowFlatThroughOwnerUi,
	loginAsWorkflowRentalUser,
	workflowMarketplaceAssetCard,
	uniqueWorkflowRentalTitle,
} from "../workflow-rental-flow-utils.js";

type ScreenshotEntry = {
	step: number;
	label: string;
	pageName: string;
	url: string;
	screenshotFile: string;
	bodyText: string;
};

function humanTimestamp(date = new Date()): string {
	const monthNames = [
		"jan",
		"feb",
		"mar",
		"apr",
		"may",
		"jun",
		"jul",
		"aug",
		"sep",
		"oct",
		"nov",
		"dec",
	];

	const month = monthNames[date.getMonth()];
	const day = String(date.getDate()).padStart(2, "0");
	const hour = String(date.getHours()).padStart(2, "0");
	const minute = String(date.getMinutes()).padStart(2, "0");
	const second = String(date.getSeconds()).padStart(2, "0");

	return `${month}-${day}-${hour}-${minute}-${second}`;
}

function slugifyLabel(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 90);
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#039;");
}

async function captureStep(
	page: Page,
	input: {
		outputDir: string;
		entries: ScreenshotEntry[];
		pageName: string;
		label: string;
	},
): Promise<void> {
	const step = input.entries.length + 1;
	const paddedStep = String(step).padStart(2, "0");
	const safePageName = slugifyLabel(input.pageName);
	const safeLabel = slugifyLabel(input.label);
	const screenshotFile = `${paddedStep}-${safePageName}-${safeLabel}.png`;
	const screenshotPath = join(input.outputDir, screenshotFile);

	await page.screenshot({
		path: screenshotPath,
		fullPage: true,
	});

	let bodyText = "";

	try {
		bodyText = await page.locator("body").innerText({ timeout: 3000 });
	} catch {
		bodyText = "";
	}

	input.entries.push({
		step,
		label: input.label,
		pageName: input.pageName,
		url: page.url(),
		screenshotFile,
		bodyText,
	});
}

function writeHtmlReport(outputDir: string, entries: ScreenshotEntry[], title: string): void {
	const rows = entries
		.map((entry) => {
			return `
				<section class="card">
					<h2>${String(entry.step).padStart(2, "0")}. ${escapeHtml(entry.pageName)} — ${escapeHtml(entry.label)}</h2>
					<p><strong>URL:</strong> <code>${escapeHtml(entry.url)}</code></p>
					<a href="./${escapeHtml(entry.screenshotFile)}">
						<img src="./${escapeHtml(entry.screenshotFile)}" alt="${escapeHtml(entry.label)}" />
					</a>
					<details>
						<summary>Visible page text</summary>
						<pre>${escapeHtml(entry.bodyText)}</pre>
					</details>
				</section>
			`;
		})
		.join("\n");

	const html = `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>${escapeHtml(title)}</title>
	<style>
		body {
			margin: 0;
			padding: 24px;
			background: #f6f7f9;
			color: #111827;
			font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
		}

		header {
			margin: 0 auto 24px;
			max-width: 1200px;
		}

		h1 {
			margin: 0 0 8px;
			font-size: 28px;
			line-height: 1.2;
		}

		.card {
			margin: 0 auto 24px;
			max-width: 1200px;
			border: 1px solid #d1d5db;
			border-radius: 18px;
			padding: 18px;
			background: #ffffff;
			box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
		}

		.card h2 {
			margin: 0 0 10px;
			font-size: 20px;
			line-height: 1.3;
		}

		code {
			white-space: normal;
			word-break: break-word;
		}

		img {
			display: block;
			width: 100%;
			height: auto;
			margin-top: 14px;
			border: 1px solid #e5e7eb;
			border-radius: 14px;
			background: #ffffff;
		}

		details {
			margin-top: 14px;
		}

		pre {
			overflow: auto;
			max-height: 420px;
			border-radius: 12px;
			padding: 14px;
			background: #111827;
			color: #f9fafb;
			font-size: 13px;
			line-height: 1.5;
			white-space: pre-wrap;
		}
	</style>
</head>
<body>
	<header>
		<h1>${escapeHtml(title)}</h1>
		<p>Generated screenshot report for workflow rental parity UI.</p>
	</header>
	${rows}
</body>
</html>
`;

	writeFileSync(join(outputDir, "index.html"), html);
}

test("capture workflow rental parity UI screenshots", async ({ browser }) => {
	test.setTimeout(120_000);

	const outputDir = join(process.cwd(), "screenshots", humanTimestamp());
	const entries: ScreenshotEntry[] = [];

	mkdirSync(outputDir, { recursive: true });

	const owner = await loginAsWorkflowRentalUser(browser, RENTAL_LOCAL_USERS.owner.email);
	const tenant = await loginAsWorkflowRentalUser(browser, RENTAL_LOCAL_USERS.tenant.email);

	try {
		const title = uniqueWorkflowRentalTitle();

		await captureStep(owner.page, {
			outputDir,
			entries,
			pageName: "owner",
			label: "after owner login before asset creation",
		});

		const { assetUrl } = await createWorkflowFlatThroughOwnerUi(owner.page, title);

		await captureStep(owner.page, {
			outputDir,
			entries,
			pageName: "owner",
			label: "after asset creation and publish",
		});

		await tenant.page.goto("/wf/marketplace", { waitUntil: "domcontentloaded" });
		const tenantAssetCard = workflowMarketplaceAssetCard(tenant.page, title);
		await expect(tenantAssetCard).toBeVisible();

		await captureStep(tenant.page, {
			outputDir,
			entries,
			pageName: "tenant",
			label: "marketplace shows created asset",
		});

		await tenantAssetCard.getByRole("link", { name: title }).click();
		await expect(tenant.page).toHaveURL(assetUrl);

		await tenant.page.waitForFunction(
			() => (window as { __rentalFormsReady?: boolean }).__rentalFormsReady === true,
		);

		await captureStep(tenant.page, {
			outputDir,
			entries,
			pageName: "tenant",
			label: "asset detail before express interest",
		});

		await tenant.page.getByLabel("Name").fill("Tenant Manual Created 1");
		await tenant.page
			.getByLabel("Official email")
			.fill("tenant_manual_created_1@company.example.com");
		await tenant.page.getByLabel("Employer").fill("Manual Company");
		await tenant.page.getByLabel("Offer").fill("59000");
		await tenant.page.getByLabel("Message").fill("Please take me please");
		await tenant.page.getByLabel("I accept the current owner conditions.").check();

		await captureStep(tenant.page, {
			outputDir,
			entries,
			pageName: "tenant",
			label: "express interest form filled",
		});

		await tenant.page.getByRole("button", { name: "Express interest" }).click();

		await expect(tenant.page).toHaveURL(/\/wf\/interests\/wf_asset_interests_[^/]+$/);
		await expect(tenant.page.getByText("Negotiation unavailable")).not.toBeVisible();
		const interestUrl = tenant.page.url();

		await expect(tenant.page.getByText("Application submitted")).toBeVisible();
		await expect(tenant.page.getByText("Please take me please")).toBeVisible();

		await captureStep(tenant.page, {
			outputDir,
			entries,
			pageName: "tenant",
			label: "after express interest application submitted",
		});

		await owner.page.goto("/wf/owner", { waitUntil: "domcontentloaded" });
		await expect(owner.page.getByRole("heading", { name: "Submitted interest inbox" })).toBeVisible();

		await captureStep(owner.page, {
			outputDir,
			entries,
			pageName: "owner",
			label: "owner inbox before opening interest",
		});

		await owner.page.locator(".inbox-item").filter({ hasText: title }).click();
		await expect(owner.page).toHaveURL(interestUrl);

		await owner.page.waitForFunction(
			() => (window as { __rentalFormsReady?: boolean }).__rentalFormsReady === true,
		);

		await expect(owner.page.getByText("Application submitted")).toBeVisible();
		await expect(owner.page.getByText("Please take me please")).toBeVisible();
		await expect(owner.page.getByRole("button", { name: "Accept applicant" })).toBeVisible();

		await captureStep(owner.page, {
			outputDir,
			entries,
			pageName: "owner",
			label: "owner interest workspace before request card",
		});

		await owner.page.getByLabel("Owner request").fill("Please upload company ID and salary slip.");

		await captureStep(owner.page, {
			outputDir,
			entries,
			pageName: "owner",
			label: "owner request card form filled",
		});

		await owner.page.getByRole("button", { name: "Create request card" }).click();
		await expect(owner.page.getByText("Please upload company ID and salary slip.")).toBeVisible();

		await captureStep(owner.page, {
			outputDir,
			entries,
			pageName: "owner",
			label: "after owner creates request card",
		});

		await tenant.page.goto(interestUrl, { waitUntil: "domcontentloaded" });
		await tenant.page.waitForFunction(
			() => (window as { __rentalFormsReady?: boolean }).__rentalFormsReady === true,
		);

		await expect(tenant.page.getByText("Your pending task cards")).toBeVisible();
		await expect(tenant.page.getByText("1 pending")).toBeVisible();

		await captureStep(tenant.page, {
			outputDir,
			entries,
			pageName: "tenant",
			label: "tenant sees pending owner request card",
		});

		await tenant.page.getByLabel("Answer").fill("Company ID and salary slip shared.");

		await captureStep(tenant.page, {
			outputDir,
			entries,
			pageName: "tenant",
			label: "tenant answer request card form filled",
		});

		await tenant.page.getByRole("button", { name: "Answer" }).click();
		await expect(tenant.page.getByText("Company ID and salary slip shared.")).toBeVisible();

		await captureStep(tenant.page, {
			outputDir,
			entries,
			pageName: "tenant",
			label: "after tenant answers owner request",
		});

		await tenant.page.getByLabel("Offer message").fill("I can move in quickly if rent is reduced to 57000.");

		await captureStep(tenant.page, {
			outputDir,
			entries,
			pageName: "tenant",
			label: "tenant offer form filled",
		});

		await tenant.page.getByRole("button", { name: "Send offer" }).click();
		await expect(
			tenant.page.getByText("I can move in quickly if rent is reduced to 57000."),
		).toBeVisible();

		await captureStep(tenant.page, {
			outputDir,
			entries,
			pageName: "tenant",
			label: "after tenant sends offer",
		});

		await owner.page.goto(interestUrl, { waitUntil: "domcontentloaded" });
		await owner.page.waitForFunction(
			() => (window as { __rentalFormsReady?: boolean }).__rentalFormsReady === true,
		);

		await captureStep(owner.page, {
			outputDir,
			entries,
			pageName: "owner",
			label: "owner sees tenant offer",
		});

		await owner.page.getByLabel("Counter terms").fill("I agree at 59000 with two months deposit.");

		await captureStep(owner.page, {
			outputDir,
			entries,
			pageName: "owner",
			label: "owner counter form filled",
		});

		await owner.page.getByRole("button", { name: "Send counter" }).click();
		await expect(owner.page.getByText("I agree at 59000 with two months deposit.")).toBeVisible();

		await captureStep(owner.page, {
			outputDir,
			entries,
			pageName: "owner",
			label: "after owner sends counter",
		});

		await owner.page.getByRole("button", { name: "Accept final terms" }).click();
		await expect(owner.page).toHaveURL(interestUrl);

		await expect(
			owner.page.getByRole("heading", {
				name: "Agreement accepted",
				exact: true,
			}),
		).toBeVisible();
		await expect(
			owner.page.getByRole("heading", {
				name: "Request booking payment confirmation",
				exact: true,
			}),
		).toBeVisible();
		await expect(owner.page.getByRole("button", { name: "Start move-in" })).toBeVisible();

		await captureStep(owner.page, {
			outputDir,
			entries,
			pageName: "owner",
			label: "after owner accepts final terms",
		});

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

		await captureStep(tenant.page, {
			outputDir,
			entries,
			pageName: "tenant",
			label: "tenant waiting state after final terms accepted",
		});

		await owner.page.goto(interestUrl, { waitUntil: "domcontentloaded" });
		await owner.page.getByLabel("Payment request").fill("Please share booking payment reference or proof.");

		await captureStep(owner.page, {
			outputDir,
			entries,
			pageName: "owner",
			label: "booking payment request form filled",
		});

		await owner.page.getByRole("button", { name: "Request booking payment confirmation" }).click();
		await expect(owner.page.getByText("Please share booking payment reference or proof.")).toBeVisible();

		await captureStep(owner.page, {
			outputDir,
			entries,
			pageName: "owner",
			label: "after owner creates booking payment request",
		});

		await tenant.page.goto(interestUrl, { waitUntil: "domcontentloaded" });
		await tenant.page.getByLabel("Reference").fill("UPI-TEST-REF-001");

		await captureStep(tenant.page, {
			outputDir,
			entries,
			pageName: "tenant",
			label: "booking payment answer form filled",
		});

		await tenant.page.getByRole("button", { name: "Answer" }).click();
		await expect(tenant.page.getByText("Reference: UPI-TEST-REF-001")).toBeVisible();

		await captureStep(tenant.page, {
			outputDir,
			entries,
			pageName: "tenant",
			label: "after tenant answers booking payment request",
		});

		await owner.page.goto(interestUrl, { waitUntil: "domcontentloaded" });
		await owner.page.getByRole("button", { name: "Start move-in" }).click();
		await expect(owner.page.getByText("Move-in started")).toBeVisible();

		await captureStep(owner.page, {
			outputDir,
			entries,
			pageName: "owner",
			label: "after owner starts move-in",
		});

		await tenant.page.goto(interestUrl, { waitUntil: "domcontentloaded" });
		await expect(tenant.page.getByText("Move-in started")).toBeVisible();

		await captureStep(tenant.page, {
			outputDir,
			entries,
			pageName: "tenant",
			label: "tenant sees move-in started",
		});

		await tenant.page.getByRole("button", { name: "Accept move-in" }).click();
await expect(
	tenant.page.getByRole("heading", {
		name: "Rented",
		exact: true,
	}),
).toBeVisible();

		await captureStep(tenant.page, {
			outputDir,
			entries,
			pageName: "tenant",
			label: "after tenant accepts move-in rented",
		});

		writeHtmlReport(outputDir, entries, `Workflow rental parity screenshots - ${title}`);

		console.log(`\nScreenshot folder:\n${outputDir}\n`);
		console.log(`HTML report:\n${join(outputDir, "index.html")}\n`);
	} catch (error) {
		writeHtmlReport(outputDir, entries, "Workflow rental parity screenshots - failed run");
		console.log(`\nScreenshot folder:\n${outputDir}\n`);
		console.log(`HTML report:\n${join(outputDir, "index.html")}\n`);
		throw error;
	} finally {
		await owner.context.close();
		await tenant.context.close();
	}
});