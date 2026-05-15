import type { APIRoute } from "astro";

import { acceptHandover } from "../../../../lib/domain/commands/accept-handover.js";
import { getStore, getUser, jsonError, jsonOk, requireParam } from "../../_domain-route-utils.js";

export const prerender = false;

export const POST: APIRoute = async (context) => {
	try {
		const store = getStore(context);
		const user = getUser(context);
		const handoverId = requireParam(context, "handoverId");
		return jsonOk(await acceptHandover(store, user, handoverId));
	} catch (error) {
		return jsonError(error);
	}
};
