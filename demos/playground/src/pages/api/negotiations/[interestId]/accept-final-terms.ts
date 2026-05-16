import type { APIRoute } from "astro";

import { parseAcceptFinalTermsRequest } from "../../../../lib/domain/api-contracts.js";
import { acceptFinalTerms } from "../../../../lib/domain/commands/accept-final-terms.js";
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
		const interestId = requireParam(context, "interestId");
		const body = parseAcceptFinalTermsRequest(await readJson(context.request));
		return jsonOk(await acceptFinalTerms(store, user, interestId, body), 201);
	} catch (error) {
		return jsonError(error);
	}
};
