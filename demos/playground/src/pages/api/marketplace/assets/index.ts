import { listMarketplaceAssets } from "../../../../lib/domain/queries/marketplace.js";
import { route, success } from "../../_domain-route-utils.js";

export const prerender = false;

export const GET = route(async ({ url }, store) => {
	const limit = Number(url.searchParams.get("limit") ?? 50);
	return success(await listMarketplaceAssets(store, limit));
});
