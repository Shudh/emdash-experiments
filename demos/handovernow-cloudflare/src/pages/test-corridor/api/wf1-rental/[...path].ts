import type { APIContext, APIRoute } from "astro";
import { getDb } from "emdash/runtime";

import { DomainError } from "../../../../lib/domain/types.js";
import { handleWorkflowRentalRoute } from "../../../../lib/wf1/api/handler.js";
import {
	applyTestLaneNoStoreHeaders,
	testLaneHostRejectionResponse,
} from "../../../../lib/wf1/routing/host-policy.js";
import { getRuntimeEnvFromLocals } from "../../../../lib/wf1/security/runtime-env.js";
import { KyselyWorkflowStore } from "../../../../lib/wf1/store/kysely-workflow-store.js";
import {
	getOptionalUser,
	jsonError,
	withRentalMutationGuard,
} from "../../../api/_domain-route-utils.js";

export const prerender = false;

function logTestApiError(error: unknown, context: APIContext): void {
	const requestUrl = context.request.url;
	const requestMethod = context.request.method;
	const routePath = context.params.path ?? "";

	if (error instanceof Error) {
		console.error("[wf1-test-api] Request failed", {
			requestMethod,
			requestUrl,
			routePath,
			name: error.name,
			message: error.message,
			stack: error.stack,
		});
		return;
	}

	console.error("[wf1-test-api] Request failed with non-Error value", {
		requestMethod,
		requestUrl,
		routePath,
		error,
	});
}

export const ALL: APIRoute = async (context) => {
	const rejection = testLaneHostRejectionResponse(context.request);

	if (rejection) {
		return rejection;
	}

	try {
		if (context.request.method !== "GET" && context.request.method !== "HEAD") {
			await withRentalMutationGuard(context, async () => undefined);
		}

		const db = context.locals.emdash?.db ?? await getDb();

		if (!db || typeof db !== "object" || !("selectFrom" in db)) {
			throw new DomainError("STORE_MISSING", "EmDash DB store is missing", 500);
		}

		const response = await handleWorkflowRentalRoute({
			request: context.request,
			path: context.params.path ?? "",
			store: new KyselyWorkflowStore(db as never),
			user: getOptionalUser(context),
			env: getRuntimeEnvFromLocals(context.locals),
			lane: "test",
			emdash: context.locals.emdash as never,
		});

		applyTestLaneNoStoreHeaders(response.headers);

		return response;
	} catch (error) {
		logTestApiError(error, context);

		const response = jsonError(error);
		applyTestLaneNoStoreHeaders(response.headers);
		return response;
	}
};
