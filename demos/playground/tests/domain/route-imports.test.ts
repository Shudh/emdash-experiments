import { describe, expect, it } from "vitest";

const routeModules = [
	"../../src/pages/api/owner/assets/add.js",
	"../../src/pages/api/owner/assets/[id]/config.js",
	"../../src/pages/api/owner/assets/[id]/publish-to-marketplace.js",
	"../../src/pages/api/marketplace/assets/[id]/express-interest.js",
	"../../src/pages/api/negotiations/[interestId]/add-round.js",
	"../../src/pages/api/negotiations/[interestId]/accept-final-terms.js",
	"../../src/pages/api/handover/[assetId]/start.js",
	"../../src/pages/api/handover/[handoverId]/accept.js",
	"../../src/pages/api/handover/[handoverId]/claim-damage.js",
	"../../src/pages/api/handover/[handoverId]/settle.js",
	"../../src/pages/api/assets/[assetId]/return-to-draft.js",
	"../../src/pages/api/assets/[assetId]/relist.js",
	"../../src/pages/api/marketplace/assets/index.js",
];

describe("rental API route modules", () => {
	it.each(routeModules)("imports %s", async (modulePath) => {
		const mod = await import(modulePath);
		expect(mod.POST ?? mod.GET).toBeTypeOf("function");
		expect(mod.prerender).toBe(false);
	});
});
