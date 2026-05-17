import type { APIRoute } from "astro";

import { parseExpressInterestRequest } from "../../../../../lib/domain/api-contracts.js";
import { expressInterest } from "../../../../../lib/domain/commands/express-interest.js";
import {
	getStore,
	getUser,
	jsonError,
	jsonOk,
	readJson,
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
			const body = parseExpressInterestRequest(await readJson(context.request));
			return jsonOk(await expressInterest(store, user, assetId, body), 201);
		});
	} catch (error) {
		return jsonError(error);
	}
};
