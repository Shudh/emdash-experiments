import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: ".",
	testMatch: "test-corridor-auth.setup.ts",
	fullyParallel: false,
	workers: 1,
	forbidOnly: !!process.env.CI,
	retries: 0,
	reporter: [["html", { outputFolder: "playwright-report", open: "never" }]],
	timeout: 15 * 60 * 1000,
	use: {
		...devices["Desktop Chrome"],
		headless: false,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		video: "retain-on-failure",
		actionTimeout: 0,
		navigationTimeout: 120_000,
	},
	projects: [
		{
			name: "chromium",
			use: {
				...devices["Desktop Chrome"],
				headless: false,
			},
		},
	],
});