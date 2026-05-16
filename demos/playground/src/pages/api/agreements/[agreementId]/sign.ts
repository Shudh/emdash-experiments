import type { APIRoute } from "astro";

import { parseSignAgreementRequest } from "../../../../lib/domain/api-contracts.js";
import { signAgreement } from "../../../../lib/domain/commands/sign-agreement.js";
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
		const agreementId = requireParam(context, "agreementId");
		const body = parseSignAgreementRequest(await readJson(context.request));
		return jsonOk(await signAgreement(store, user, agreementId, body));
	} catch (error) {
		return jsonError(error);
	}
};
