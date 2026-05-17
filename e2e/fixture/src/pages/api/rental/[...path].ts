import type { APIRoute } from "astro";

import { MemoryDomainStore } from "../../../../../../demos/playground/src/lib/domain/db.js";
import { handleRentalRoute } from "../../../../../../demos/playground/src/lib/domain/rental-route-handler.js";
import type { UserContext } from "../../../../../../demos/playground/src/lib/domain/types.js";
import { DomainError } from "../../../../../../demos/playground/src/lib/domain/types.js";

export const prerender = false;

const STORE_KEY = Symbol.for("emdash.playground-rental.e2e-store");

type GlobalWithRentalStore = typeof globalThis & { [STORE_KEY]?: MemoryDomainStore };
type UserLike = { id?: string; email?: string | null; name?: string | null; role?: unknown };

function holder(): GlobalWithRentalStore {
	return globalThis as GlobalWithRentalStore;
}

function store(): MemoryDomainStore {
	const globalHolder = holder();
	globalHolder[STORE_KEY] ??= new MemoryDomainStore();
	return globalHolder[STORE_KEY];
}

function resetStore(): MemoryDomainStore {
	const globalHolder = holder();
	globalHolder[STORE_KEY] = new MemoryDomainStore();
	return globalHolder[STORE_KEY];
}

function optionalUserFrom(locals: { user?: UserLike | null }): UserContext | null {
	const user = locals.user;
	if (!user?.id) return null;
	return {
		id: user.id,
		email: user.email ?? undefined,
		name: user.name ?? undefined,
		role:
			typeof user.role === "string" || typeof user.role === "number"
				? String(user.role)
				: undefined,
	};
}

function fail(error: unknown): Response {
	if (error instanceof DomainError) {
		return Response.json(
			{ ok: false, error: { code: error.code, message: error.message } },
			{ status: error.status },
		);
	}
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
			store: store(),
			user: optionalUserFrom(locals),
			resetPolicy: "enabled-memory-only",
			resetStore,
		});
	} catch (error) {
		return fail(error);
	}
};
