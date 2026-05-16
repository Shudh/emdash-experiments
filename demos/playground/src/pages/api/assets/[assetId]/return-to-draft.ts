import type { APIRoute } from "astro";

import { returnAssetToDraft } from "../../../../lib/domain/commands/return-asset-to-draft.js";
import { getStore, getUser, jsonError, jsonOk, requireParam } from "../../_domain-route-utils.js";

export const prerender = false;

export const POST: APIRoute = async (context) => {
	try {
		const store = getStore(context);
		const user = getUser(context);
		const assetId = requireParam(context, "assetId");
		return jsonOk(await returnAssetToDraft(store, user, assetId));
	} catch (error) {
		return jsonError(error);
	}
};
