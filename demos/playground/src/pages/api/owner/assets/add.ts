import type { APIRoute } from "astro";

import { parseAddAssetRequest } from "../../../../lib/domain/api-contracts.js";
import { addAsset } from "../../../../lib/domain/commands/add-asset.js";
import { getStore, getUser, jsonError, jsonOk, readJson } from "../../_domain-route-utils.js";

export const prerender = false;

export const POST: APIRoute = async (context) => {
	try {
		const store = getStore(context);
		const user = getUser(context);
		const body = parseAddAssetRequest(await readJson(context.request));
		return jsonOk(await addAsset(store, user, body), 201);
	} catch (error) {
		return jsonError(error);
	}
};
