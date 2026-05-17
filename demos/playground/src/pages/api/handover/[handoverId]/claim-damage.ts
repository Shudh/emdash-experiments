import type { APIRoute } from "astro";

import { parseClaimHandoverDamageRequest } from "../../../../lib/domain/api-contracts.js";
import { claimHandoverDamage } from "../../../../lib/domain/commands/claim-handover-damage.js";
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
			const handoverId = requireParam(context, "handoverId");
			const body = parseClaimHandoverDamageRequest(await readJson(context.request));
			return jsonOk(await claimHandoverDamage(store, user, handoverId, body));
		});
	} catch (error) {
		return jsonError(error);
	}
};
