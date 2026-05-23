import { expect, test } from "@playwright/test";

test("WF1 D1 cloud mode pages and anonymous marketplace API render", async ({ page, request }) => {
	await page.goto("/wf1", { waitUntil: "domcontentloaded" });
	await expect(page.getByRole("heading", { name: /Clean rentals/i }).first()).toBeVisible();
	await expect(page.locator('a[href^="/wf/"]')).toHaveCount(0);

	await page.goto("/wf1/marketplace", { waitUntil: "domcontentloaded" });
	await expect(page.getByRole("heading", { name: /Published assets/i }).first()).toBeVisible();
	await expect(page.locator('a[href^="/wf/"]')).toHaveCount(0);

	const response = await request.get("/api/wf1-rental/marketplace/assets");
	expect(response.ok()).toBe(true);
	await expect(await response.json()).toEqual(expect.objectContaining({ ok: true }));
});
