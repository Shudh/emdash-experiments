import { sql, type Kysely } from "kysely";
import { getDb } from "emdash/runtime";

import { DomainError } from "../../domain/types.js";

/**
 * WF1 request rate limiting.
 *
 * This intentionally mirrors EmDash core's DB-backed auth rate limiter
 * from packages/core/src/auth/rate-limit.ts instead of requiring paid
 * Cloudflare WAF rules for the first production guard.
 *
 * Shared table:
 *   _emdash_rate_limits(key, window, count)
 *
 * Key format:
 *   {ip}:{wf1 endpoint family}
 *
 * Window format:
 *   ISO timestamp truncated to the window size.
 */

type AnyDb = Record<string, unknown>;

const IP_PATTERN = /^[\da-fA-F.:]+$/;

export type Wf1RateLimitResult = {
	allowed: boolean;
	count: number;
	limit: number;
};

type Wf1RateLimitRule = {
	endpoint: string;
	maxRequests: number;
	windowSeconds: number;
};

const WF1_RATE_LIMIT_RULES = {
	expressInterest: {
		endpoint: "wf1:express-interest",
		maxRequests: 20,
		windowSeconds: 10 * 60,
	},
	assetDraftIntent: {
		endpoint: "wf1:asset-draft-intent",
		maxRequests: 20,
		windowSeconds: 10 * 60,
	},
	uploads: {
		endpoint: "wf1:uploads",
		maxRequests: 60,
		windowSeconds: 10 * 60,
	},
	assetAdd: {
		endpoint: "wf1:asset-add",
		maxRequests: 12,
		windowSeconds: 60 * 60,
	},
} as const satisfies Record<string, Wf1RateLimitRule>;

export async function assertWf1ExposedPostRateLimit(request: Request, path: string): Promise<void> {
	if (request.method !== "POST") {
		return;
	}

	const rule = ruleForWf1Path(path);
	if (rule === null) {
		return;
	}

	const db = (await getDb()) as unknown as Kysely<AnyDb>;
	const result = await checkWf1RateLimit(
		db,
		getWf1ClientIp(request),
		rule.endpoint,
		rule.maxRequests,
		rule.windowSeconds,
	);

	if (!result.allowed) {
		throw new DomainError(
			"RATE_LIMITED",
			"Too many requests. Please wait and try again.",
			429,
		);
	}
}

function ruleForWf1Path(path: string): Wf1RateLimitRule | null {
	const parts = path.split("/").filter(Boolean);

	if (parts.length === 1 && parts[0] === "uploads") {
		return WF1_RATE_LIMIT_RULES.uploads;
	}

	if (parts.length === 3 && parts[0] === "owner" && parts[1] === "assets" && parts[2] === "add") {
		return WF1_RATE_LIMIT_RULES.assetAdd;
	}

	if (parts.length === 3 && parts[0] === "owner" && parts[1] === "assets" && parts[2] === "draft-intent") {
		return WF1_RATE_LIMIT_RULES.assetDraftIntent;
	}

	if (
		parts.length === 4 &&
		parts[0] === "marketplace" &&
		parts[1] === "assets" &&
		parts[2] !== "" &&
		parts[3] === "express-interest"
	) {
		return WF1_RATE_LIMIT_RULES.expressInterest;
	}

	return null;
}

export async function checkWf1RateLimit(
	db: Kysely<AnyDb>,
	ip: string | null,
	endpoint: string,
	maxRequests: number,
	windowSeconds: number,
): Promise<Wf1RateLimitResult> {
	if (!ip) {
		return { allowed: true, count: 0, limit: maxRequests };
	}

	const windowStart = new Date(
		Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000,
	).toISOString();
	const key = `${ip}:${endpoint}`;

	const result = await sql<{ count: number }>`
		INSERT INTO _emdash_rate_limits (key, "window", count)
		VALUES (${key}, ${windowStart}, 1)
		ON CONFLICT (key, "window")
		DO UPDATE SET count = _emdash_rate_limits.count + 1
		RETURNING count
	`.execute(db);

	const count = result.rows[0]?.count ?? 1;

	if (Math.random() < 0.01) {
		cleanupExpiredWf1RateLimits(db).catch(() => {
			// Best-effort cleanup only; never fail the user request because cleanup failed.
		});
	}

	return {
		allowed: count <= maxRequests,
		count,
		limit: maxRequests,
	};
}

export function getWf1ClientIp(request: Request, trustedHeaders: string[] = []): string | null {
	const headers = request.headers;
	const cf = (request as unknown as { cf?: Record<string, unknown> }).cf;

	if (cf) {
		const cfIp = headers.get("cf-connecting-ip")?.trim();
		if (cfIp && IP_PATTERN.test(cfIp)) {
			return cfIp;
		}

		const xff = headers.get("x-forwarded-for");
		if (xff) {
			const first = xff.split(",")[0]?.trim();
			if (first && IP_PATTERN.test(first)) {
				return first;
			}
		}
	}

	for (const name of trustedHeaders) {
		const value = readIpFromHeader(headers, name);
		if (value) return value;
	}

	return null;
}

function readIpFromHeader(headers: Headers, name: string): string | null {
	const value = headers.get(name);
	if (!value) return null;
	if (name.toLowerCase().endsWith("forwarded-for")) {
		const first = value.split(",")[0]?.trim();
		if (!first) return null;
		return IP_PATTERN.test(first) ? first : null;
	}
	const trimmed = value.trim();
	if (!trimmed) return null;
	return IP_PATTERN.test(trimmed) ? trimmed : null;
}

export async function cleanupExpiredWf1RateLimits(
	db: Kysely<AnyDb>,
	maxAgeSeconds = 3600,
): Promise<number> {
	const cutoff = new Date(Date.now() - maxAgeSeconds * 1000).toISOString();
	const result = await sql`
		DELETE FROM _emdash_rate_limits WHERE "window" < ${cutoff}
	`.execute(db);
	return Number(result.numAffectedRows ?? 0);
}
