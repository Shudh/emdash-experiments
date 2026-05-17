import type { APIRoute } from "astro";
import type { Kysely } from "kysely";
import { getDb } from "emdash/runtime";

import { KyselyDomainStore } from "../../../../../../demos/playground/src/lib/domain/kysely-store.js";
import { handleRentalRoute } from "../../../../../../demos/playground/src/lib/domain/rental-route-handler.js";
import type { DomainStore, UserContext } from "../../../../../../demos/playground/src/lib/domain/types.js";
import { DomainError } from "../../../../../../demos/playground/src/lib/domain/types.js";

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
		domainStore?: DomainStore;
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

async function getDomainStore(locals: LocalsLike): Promise<DomainStore> {
	if (locals.emdash?.domainStore) {
		return locals.emdash.domainStore;
	}

	if (isKyselyDatabase(locals.emdash?.db)) {
		return new KyselyDomainStore(locals.emdash.db);
	}

	const db = await getDb();

	if (isKyselyDatabase(db)) {
		return new KyselyDomainStore(db);
	}

	throw new DomainError("STORE_MISSING", "EmDash DB store is missing", 500);
}

function fail(error: unknown): Response {
	if (error instanceof DomainError) {
		return Response.json(
			{ ok: false, error: { code: error.code, message: error.message } },
			{ status: error.status },
		);
	}

	console.error("[rental-fixture] API route failed", error);

	return Response.json(
		{ ok: false, error: { code: "INTERNAL_ERROR", message: "Internal error" } },
		{ status: 500 },
	);
}

export const ALL: APIRoute = async ({ request, locals, params }) => {
	try {
		return await handleRentalRoute({
			request,
			path: params.path ?? "",
			store: await getDomainStore(locals as LocalsLike),
			user: optionalUserFrom(locals),
			resetPolicy: "disabled",
		});
	} catch (error) {
		return fail(error);
	}
};