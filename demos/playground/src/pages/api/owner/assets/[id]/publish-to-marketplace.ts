import type { APIRoute } from "astro";

import { publishAssetToMarketplace } from "../../../../../lib/domain/commands/publish-asset-to-marketplace.js";
import {
	getStore,
	getUser,
	jsonError,
	jsonOk,
	requireParam,
	withRentalMutationGuard,
} from "../../../_domain-route-utils.js";

export const prerender = false;

export const POST: APIRoute = async (context) => {
	try {
		return await withRentalMutationGuard(context, async () => {
			const store = getStore(context);
			const user = getUser(context);
			const assetId = requireParam(context, "id");
			return jsonOk(await publishAssetToMarketplace(store, user, assetId));
		});
	} catch (error) {
		return jsonError(error);
	}
};
