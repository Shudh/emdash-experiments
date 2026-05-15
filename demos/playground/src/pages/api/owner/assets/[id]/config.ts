import type { APIRoute } from "astro";

import { parseUpdateAssetConfigRequest } from "../../../../../lib/domain/api-contracts.js";
import { updateAssetConfig } from "../../../../../lib/domain/commands/update-asset-config.js";
import {
	getStore,
	getUser,
	jsonError,
	jsonOk,
	readJson,
	requireParam,
} from "../../../_domain-route-utils.js";

export const prerender = false;

export const POST: APIRoute = async (context) => {
	try {
		const store = getStore(context);
		const user = getUser(context);
		const assetId = requireParam(context, "id");
		const body = parseUpdateAssetConfigRequest(await readJson(context.request));
		return jsonOk(await updateAssetConfig(store, user, assetId, body));
	} catch (error) {
		return jsonError(error);
	}
};
