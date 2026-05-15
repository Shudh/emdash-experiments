import type { APIRoute } from "astro";

import { parseAddNegotiationRoundRequest } from "../../../../lib/domain/api-contracts.js";
import { addHandoverNegotiationRound } from "../../../../lib/domain/commands/add-handover-negotiation-round.js";
import {
	getStore,
	getUser,
	jsonError,
	jsonOk,
	readJson,
	requireParam,
} from "../../_domain-route-utils.js";

export const prerender = false;

export const POST: APIRoute = async (context) => {
	try {
		const store = getStore(context);
		const user = getUser(context);
		const handoverId = requireParam(context, "handoverId");
		const body = parseAddNegotiationRoundRequest(await readJson(context.request));
		return jsonOk(await addHandoverNegotiationRound(store, user, handoverId, body), 201);
	} catch (error) {
		return jsonError(error);
	}
};
