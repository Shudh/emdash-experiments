import { publishAssetToMarketplace } from "../../../../../lib/domain/commands/assets.js";
import { requireParam, route, success } from "../../../_domain-route-utils.js";

export const prerender = false;

export const POST = route(async ({ params }, store) =>
	success(await publishAssetToMarketplace(store, requireParam(params, "id"))),
);
