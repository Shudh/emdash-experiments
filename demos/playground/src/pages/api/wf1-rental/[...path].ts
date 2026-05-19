import type { APIRoute } from "astro";

import { DomainError } from "../../../lib/domain/types.js";
import { handleWorkflowRentalRoute } from "../../../lib/wf1/api/handler.js";
import { KyselyWorkflowStore } from "../../../lib/wf1/store/kysely-workflow-store.js";
import { getOptionalUser, jsonError, withRentalMutationGuard } from "../_domain-route-utils.js";

export const prerender = false;

export const ALL: APIRoute = async (context) => {
	try {
		if (context.request.method !== "GET" && context.request.method !== "HEAD") {
			await withRentalMutationGuard(context, async () => undefined);
		}
		const db = context.locals.emdash?.db;
		if (!db || typeof db !== "object" || !("selectFrom" in db)) {
			throw new DomainError("STORE_MISSING", "EmDash DB store is missing", 500);
		}
		return await handleWorkflowRentalRoute({
			request: context.request,
			path: context.params.path ?? "",
			store: new KyselyWorkflowStore(db as never),
			user: getOptionalUser(context),
		});
	} catch (error) {
		return jsonError(error);
	}
};
