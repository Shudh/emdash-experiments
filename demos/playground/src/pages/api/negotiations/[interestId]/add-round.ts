import type { APIRoute } from "astro";

import { parseAddNegotiationRoundRequest } from "../../../../lib/domain/api-contracts.js";
import { addNegotiationRound } from "../../../../lib/domain/commands/add-negotiation-round.js";
import {
	getStore,
	getUser,
	jsonError,
	jsonOk,
	readJson,
	requireParam,
	withRentalMutationGuard,
} from "../../_domain-route-utils.js";

export const prerender = false;

export const POST: APIRoute = async (context) => {
	try {
		return await withRentalMutationGuard(context, async () => {
			const store = getStore(context);
			const user = getUser(context);
			const interestId = requireParam(context, "interestId");
			const body = parseAddNegotiationRoundRequest(await readJson(context.request));
			return jsonOk(await addNegotiationRound(store, user, interestId, body), 201);
		});
	} catch (error) {
		return jsonError(error);
	}
};
