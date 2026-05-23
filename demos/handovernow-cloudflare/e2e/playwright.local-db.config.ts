import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: ".",
	fullyParallel: false,
	workers: 1,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: [["html", { outputFolder: "playwright-report", open: "never" }]],
	timeout: 30_000,
	use: {
		baseURL: "http://127.0.0.1:4321",
		trace: "on-first-retry",
		screenshot: "only-on-failure",
	},
	webServer: {
		command: "HANDOVERNOW_DB_TARGET=local pnpm dev --host 127.0.0.1",
		cwd: "../",
		url: "http://127.0.0.1:4321/wf1",
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
});
