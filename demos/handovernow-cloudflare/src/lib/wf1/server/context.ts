import { getDb } from "emdash/runtime";

import { DomainError } from "../../domain/types.js";
import type { DomainStore, UserContext } from "../../domain/types.js";
import { KyselyWorkflowStore } from "../store/kysely-workflow-store.js";

type AstroUserLike = {
	id?: string;
	userId?: string;
	sub?: string;
	email?: string | null;
	role?: unknown;
	name?: string | null;
};

type EmDashLikeLocals = {
	user?: AstroUserLike | null;
	emdash?: {
		domainStore?: DomainStore;
		db?: unknown;
	};
};

type AstroLike = {
	locals: EmDashLikeLocals;
};

function isKyselyDatabase(value: unknown): value is { selectFrom: unknown } {
	return !!value && typeof value === "object" && "selectFrom" in value;
}

export function getWf1OptionalUserFromLocals(locals: EmDashLikeLocals): UserContext | null {
	const user = locals.user;
	const id = user?.id ?? user?.userId ?? user?.sub;

	if (!user || !id) {
		return null;
	}

	return {
		id,
		email: user.email ?? undefined,
		name: user.name ?? undefined,
		role: typeof user.role === "string" ? user.role : undefined,
	};
}

export function getWf1UserFromLocals(locals: EmDashLikeLocals): UserContext {
	const user = getWf1OptionalUserFromLocals(locals);

	if (!user) {
		throw new DomainError("UNAUTHORIZED", "Login required", 401);
	}

	return user;
}

export async function getWf1StoreFromLocals(locals: EmDashLikeLocals): Promise<DomainStore> {
	const existingStore = locals.emdash?.domainStore;

	if (existingStore) {
		return existingStore;
	}

	const db = locals.emdash?.db ?? (await getDb());

	if (!isKyselyDatabase(db)) {
		throw new DomainError("STORE_MISSING", "EmDash DB store is missing", 500);
	}

	return new KyselyWorkflowStore(db as never);
}

export async function getWf1PageContext(astro: AstroLike): Promise<{
	store: DomainStore;
	user: UserContext | null;
}> {
	return {
		store: await getWf1StoreFromLocals(astro.locals),
		user: getWf1OptionalUserFromLocals(astro.locals),
	};
}

export async function getRequiredWf1PageContext(astro: AstroLike): Promise<{
	store: DomainStore;
	user: UserContext;
}> {
	return {
		store: await getWf1StoreFromLocals(astro.locals),
		user: getWf1UserFromLocals(astro.locals),
	};
}