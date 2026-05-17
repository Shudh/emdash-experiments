import type { APIRoute } from "astro";

import { handleRentalRoute } from "../../../lib/domain/rental-route-handler.js";
import {
	getOptionalUser,
	getStore,
	jsonError,
	withRentalMutationGuard,
} from "../_domain-route-utils.js";

export const prerender = false;

export const ALL: APIRoute = async (context) => {
	try {
		if (context.request.method !== "GET" && context.request.method !== "HEAD") {
			await withRentalMutationGuard(context, async () => undefined);
		}
		return await handleRentalRoute({
			request: context.request,
			path: context.params.path ?? "",
			store: getStore(context),
			user: getOptionalUser(context),
			resetPolicy: "disabled",
		});
	} catch (error) {
		return jsonError(error);
	}
};
