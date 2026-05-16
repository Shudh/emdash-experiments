import type { Kysely } from "kysely";

import { requireStore } from "../../lib/domain/db.js";
import { KyselyDomainStore } from "../../lib/domain/kysely-store.js";
import type { DomainStore, UserContext } from "../../lib/domain/types.js";
import { DomainError } from "../../lib/domain/types.js";

export const prerender = false;

type AstroUserLike = {
	id?: string;
	userId?: string;
	sub?: string;
	email?: string | null;
	role?: unknown;
	name?: string | null;
};

function isKyselyDatabase(value: unknown): value is Kysely<Record<string, unknown>> {
	return !!value && typeof value === "object" && "schema" in value && "selectFrom" in value;
}

type AstroLikeContext = {
	request: Request;
	locals: {
		user?: AstroUserLike | null;
		emdash?: { domainStore?: DomainStore; db?: unknown };
	};
	params: Record<string, string | undefined>;
};

export async function readJson(request: Request): Promise<unknown> {
	const text = await request.text();
	if (!text.trim()) return {};
	try {
		return JSON.parse(text) as unknown;
	} catch (error) {
		throw new DomainError("INVALID_JSON", "Request body must be valid JSON", 400, { cause: error });
	}
}

export function getUser(context: AstroLikeContext): UserContext {
	const user = context.locals.user;
	const id = user?.id ?? user?.userId ?? user?.sub;
	if (!user || !id) throw new DomainError("UNAUTHORIZED", "Login required", 401);
	return {
		id,
		email: user.email ?? undefined,
		name: user.name ?? undefined,
		role: typeof user.role === "string" ? user.role : undefined,
	};
}

export function getOptionalUser(context: AstroLikeContext): UserContext | null {
	try {
		return getUser(context);
	} catch (error) {
		if (error instanceof DomainError && error.code === "UNAUTHORIZED") return null;
		throw error;
	}
}

export function getStore(context: AstroLikeContext): DomainStore {
	const existingStore = context.locals.emdash?.domainStore;
	if (existingStore) return requireStore(existingStore);
	const db = context.locals.emdash?.db;
	if (isKyselyDatabase(db)) return new KyselyDomainStore(db);
	return requireStore(undefined);
}

export function requireParam(context: AstroLikeContext, name: string): string {
	const value = context.params[name];
	if (!value) throw new DomainError("MISSING_PARAM", `${name} is required`, 400);
	return value;
}

export function jsonOk(data: unknown, status = 200): Response {
	return new Response(JSON.stringify({ ok: true, data }, null, 2), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

export function jsonError(error: unknown): Response {
	if (error instanceof DomainError) {
		return new Response(
			JSON.stringify({ ok: false, error: { code: error.code, message: error.message } }, null, 2),
			{
				status: error.status,
				headers: { "Content-Type": "application/json" },
			},
		);
	}
	return new Response(
		JSON.stringify(
			{ ok: false, error: { code: "INTERNAL_ERROR", message: "Internal error" } },
			null,
			2,
		),
		{
			status: 500,
			headers: { "Content-Type": "application/json" },
		},
	);
}

export type { AstroLikeContext };
