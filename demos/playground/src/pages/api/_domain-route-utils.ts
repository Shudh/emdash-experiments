import type { APIRoute } from "astro";

import { getRentalDomainStore } from "../../lib/domain/db.js";
import { DomainError } from "../../lib/domain/errors.js";
import type { RentalDomainStore } from "../../lib/domain/types.js";

export const jsonHeaders = { "Cache-Control": "private, no-store" };

export function success(data: unknown, status = 200): Response {
	return Response.json({ data }, { status, headers: jsonHeaders });
}

export function error(code: string, message: string, status: number): Response {
	return Response.json({ error: { code, message } }, { status, headers: jsonHeaders });
}

export async function parseJson<T = unknown>(request: Request): Promise<T> {
	try {
		return await request.json();
	} catch {
		throw new DomainError("INVALID_JSON", "Request body must be valid JSON");
	}
}

export function requireParam(params: Record<string, string | undefined>, key: string): string {
	const value = params[key];
	if (!value) throw new DomainError("MISSING_PARAM", `Missing route parameter: ${key}`);
	return value;
}

export function route(
	handler: (context: Parameters<APIRoute>[0], store: RentalDomainStore) => Promise<Response>,
): APIRoute {
	return async (context) => {
		try {
			const store = await getRentalDomainStore(context.locals);
			return await handler(context, store);
		} catch (caught) {
			if (caught instanceof DomainError)
				return error(caught.code, caught.message, caught.code === "INVALID_JSON" ? 400 : 422);
			console.error("[rental-domain] API route failed", caught);
			return error("RENTAL_DOMAIN_ERROR", "Rental domain request failed", 500);
		}
	};
}
