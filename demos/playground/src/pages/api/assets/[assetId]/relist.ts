import type { APIRoute } from "astro";

import { relistAsset } from "../../../../lib/domain/commands/relist-asset.js";
import { getStore, getUser, jsonError, jsonOk, requireParam } from "../../_domain-route-utils.js";

export const prerender = false;

export const POST: APIRoute = async (context) => {
	try {
		const store = getStore(context);
		const user = getUser(context);
		const assetId = requireParam(context, "assetId");
		return jsonOk(await relistAsset(store, user, assetId));
	} catch (error) {
		return jsonError(error);
	}
};
