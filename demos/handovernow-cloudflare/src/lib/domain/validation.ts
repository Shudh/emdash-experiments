import { DomainError } from "./types.js";

const DIACRITIC_PATTERN = /[\u0300-\u036f]/g;
const NON_SLUG_PATTERN = /[^a-z0-9]+/g;
const EDGE_DASH_PATTERN = /^-+|-+$/g;
const AGREEMENT_ID_CLEANUP_PATTERN = /[^a-zA-Z0-9]/g;
const DASH_PATTERN = /-/g;

export function requiredString(value: unknown, field: string): string {
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new DomainError("VALIDATION_ERROR", `${field} is required`, 400);
	}
	return value.trim();
}

export function optionalString(value: unknown): string | undefined {
	if (value === undefined || value === null || value === "") return undefined;
	if (typeof value !== "string") throw new DomainError("VALIDATION_ERROR", "Expected string", 400);
	return value.trim();
}

export function optionalNumber(value: unknown): number | undefined {
	if (value === undefined || value === null || value === "") return undefined;
	if (typeof value !== "number" || !Number.isFinite(value)) {
		throw new DomainError("VALIDATION_ERROR", "Expected finite number", 400);
	}
	return value;
}

export function optionalObject(value: unknown): Record<string, unknown> | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value !== "object" || Array.isArray(value)) {
		throw new DomainError("VALIDATION_ERROR", "Expected object", 400);
	}
	return Object.fromEntries(Object.entries(value));
}

function sortJsonValue(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortJsonValue);
	if (!value || typeof value !== "object") return value;
	return Object.fromEntries(
		Object.entries(value)
			.toSorted(([a], [b]) => a.localeCompare(b))
			.map(([key, entry]) => [key, sortJsonValue(entry)]),
	);
}

export function stableJson(value: unknown): string {
	return JSON.stringify(sortJsonValue(value));
}

export function ownerConditionsHash(value: unknown): string {
	const input = stableJson(value);
	let hash = 5381;
	for (const char of input) hash = (hash * 33) ^ char.charCodeAt(0);
	return `cond_${(hash >>> 0).toString(36)}`;
}

export function slugify(input: string): string {
	const slug = input
		.trim()
		.toLowerCase()
		.normalize("NFKD")
		.replace(DIACRITIC_PATTERN, "")
		.replace(NON_SLUG_PATTERN, "-")
		.replace(EDGE_DASH_PATTERN, "")
		.slice(0, 80);
	return slug || `item-${Date.now()}`;
}

export function createSlug(title: string, suffix?: string): string {
	const base = slugify(title);
	return suffix ? `${base}-${slugify(suffix).slice(0, 12)}` : base;
}

export function makeAgreementNumber(nowIso: string, assetId: string): string {
	const date = nowIso.slice(0, 10).replace(DASH_PATTERN, "");
	const suffix = assetId.replace(AGREEMENT_ID_CLEANUP_PATTERN, "").slice(-8).toUpperCase();
	return `AGR-${date}-${suffix}`;
}
