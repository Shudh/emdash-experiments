import { DomainError, assertRecord } from "../../domain/types.js";

export function parseRecord(value: unknown): Record<string, unknown> {
	return assertRecord(value, "Request body");
}

export function stringField(
	record: Record<string, unknown>,
	key: string,
	fallback?: string,
): string {
	const value = record[key];
	if (typeof value === "string" && value.trim()) return value.trim();
	if (fallback !== undefined) return fallback;
	throw new DomainError("VALIDATION_ERROR", `${key} is required`, 400);
}

export function optionalNumber(record: Record<string, unknown>, key: string): number | undefined {
	const value = record[key];
	if (value === undefined || value === null || value === "") return undefined;
	const number = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(number))
		throw new DomainError("VALIDATION_ERROR", `${key} must be a number`, 400);
	return number;
}

export function optionalRecord(
	record: Record<string, unknown>,
	key: string,
): Record<string, unknown> | undefined {
	const value = record[key];
	if (value === undefined || value === null) return undefined;
	return assertRecord(value, key);
}

export function optionalArray(
	record: Record<string, unknown>,
	key: string,
): Array<Record<string, unknown>> {
	const value = record[key];
	if (value === undefined || value === null) return [];
	if (value && typeof value === "object" && !Array.isArray(value)) {
		return Object.values(value).map((item) => assertRecord(item, key));
	}
	if (!Array.isArray(value))
		throw new DomainError("VALIDATION_ERROR", `${key} must be an array`, 400);
	return value.map((item) => assertRecord(item, key));
}
