import type { APIRoute } from "astro";
import { getDb } from "emdash/runtime";
import type { Kysely } from "kysely";

import { DomainError } from "../../../../../../demos/playground/src/lib/domain/types.js";
import type { UserContext } from "../../../../../../demos/playground/src/lib/domain/types.js";
import { handleWorkflowRentalRoute } from "../../../../../../demos/playground/src/lib/workflow-rental/api/handler.js";
import { KyselyWorkflowStore } from "../../../../../../demos/playground/src/lib/workflow-rental/store/kysely-workflow-store.js";

export const prerender = false;

type AnyDb = Record<string, unknown>;

type UserLike = {
	id?: string;
	userId?: string;
	sub?: string;
	email?: string | null;
	name?: string | null;
	role?: unknown;
};

type LocalsLike = {
	user?: UserLike | null;
	emdash?: {
		db?: unknown;
	};
};

function optionalUserFrom(locals: { user?: UserLike | null }): UserContext | null {
	const user = locals.user;
	const id = user?.id ?? user?.userId ?? user?.sub;
	if (!user || !id) return null;
	return {
		id,
		email: user.email ?? undefined,
		name: user.name ?? undefined,
		role:
			typeof user.role === "string" || typeof user.role === "number"
				? String(user.role)
				: undefined,
	};
}

function isKyselyDatabase(value: unknown): value is Kysely<AnyDb> {
	return !!value && typeof value === "object" && "schema" in value && "selectFrom" in value;
}

async function getWorkflowStore(locals: LocalsLike): Promise<KyselyWorkflowStore> {
	if (isKyselyDatabase(locals.emdash?.db)) return new KyselyWorkflowStore(locals.emdash.db);
	const db = await getDb();
	if (isKyselyDatabase(db)) return new KyselyWorkflowStore(db);
	throw new DomainError("STORE_MISSING", "EmDash DB store is missing", 500);
}

function requireWorkflowCsrf(request: Request): void {
	if (request.method === "GET" || request.method === "HEAD") return;
	if (request.headers.get("X-EmDash-Request") !== "1") {
		throw new DomainError(
			"CSRF_REJECTED",
			"Workflow rental mutation requires X-EmDash-Request",
			403,
		);
	}
}

function fail(error: unknown): Response {
	if (error instanceof DomainError) {
		return Response.json(
			{ ok: false, error: { code: error.code, message: error.message } },
			{ status: error.status },
		);
	}
	console.error("[wf-rental-fixture] API route failed", error);
	return Response.json(
		{ ok: false, error: { code: "INTERNAL_ERROR", message: "Internal error" } },
		{ status: 500 },
	);
}

export const ALL: APIRoute = async ({ request, locals, params }) => {
	try {
		requireWorkflowCsrf(request);
		return await handleWorkflowRentalRoute({
			request,
			path: params.path ?? "",
			store: await getWorkflowStore(locals as LocalsLike),
			user: optionalUserFrom(locals),
		});
	} catch (error) {
		return fail(error);
	}
};
