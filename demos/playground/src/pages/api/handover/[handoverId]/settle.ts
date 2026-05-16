import type { APIRoute } from "astro";

import { parseSettleHandoverRequest } from "../../../../lib/domain/api-contracts.js";
import { settleHandover } from "../../../../lib/domain/commands/settle-handover.js";
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
		const body = parseSettleHandoverRequest(await readJson(context.request));
		return jsonOk(await settleHandover(store, user, handoverId, body));
	} catch (error) {
		return jsonError(error);
	}
};
