import type { JsonObject } from "./types";
import { startTrace } from "./debugTrace";

const TRACE_SCOPE = "objectUtils";

export function isObjectRecord(value: unknown): value is JsonObject {
	const trace = startTrace(TRACE_SCOPE, "isObjectRecord", {
		valueType: typeof value,
		isArray: Array.isArray(value),
		isNull: value === null,
	});

	if (value === null) {
		trace.end({ result: false, reason: "value is null" });
		return false;
	}

	if (typeof value !== "object") {
		trace.end({ result: false, reason: "value is not an object", valueType: typeof value });
		return false;
	}

	if (Array.isArray(value)) {
		trace.end({ result: false, reason: "value is an array" });
		return false;
	}

	trace.end({ result: true, reason: "value is a non-null object and not an array" });
	return true;
}

export function objectValue(value: unknown): JsonObject {
	const trace = startTrace(TRACE_SCOPE, "objectValue", {
		valueType: typeof value,
		isArray: Array.isArray(value),
		isNull: value === null,
	});

	if (isObjectRecord(value)) {
		trace.end({ returnedOriginalObject: true });
		return value;
	}

	trace.end({ returnedOriginalObject: false, fallback: {} });
	return {};
}

export function arrayOfObjects(value: unknown): JsonObject[] {
	const trace = startTrace(TRACE_SCOPE, "arrayOfObjects", {
		valueType: typeof value,
		isArray: Array.isArray(value),
	});

	if (!Array.isArray(value)) {
		trace.end({ resultLength: 0, reason: "value is not an array" });
		return [];
	}

	const objects: JsonObject[] = [];

	for (const item of value) {
		if (isObjectRecord(item)) {
			objects.push(item);
		}
	}

	trace.end({ originalLength: value.length, resultLength: objects.length });
	return objects;
}

export function stringValue(value: unknown, fallback = ""): string {
	const trace = startTrace(TRACE_SCOPE, "stringValue", {
		value,
		valueType: typeof value,
		fallback,
	});

	if (typeof value === "string") {
		trace.end({ result: value, source: "string" });
		return value;
	}

	if (typeof value === "number" && Number.isFinite(value)) {
		const result = String(value);
		trace.end({ result, source: "number" });
		return result;
	}

	if (typeof value === "boolean") {
		const result = String(value);
		trace.end({ result, source: "boolean" });
		return result;
	}

	trace.end({ result: fallback, source: "fallback" });
	return fallback;
}

export function numberValue(value: unknown, fallback = 0): number {
	const trace = startTrace(TRACE_SCOPE, "numberValue", {
		value,
		valueType: typeof value,
		fallback,
	});

	if (typeof value === "number") {
		if (Number.isFinite(value)) {
			trace.end({ result: value, source: "number" });
			return value;
		}

		trace.end({ result: fallback, source: "fallback", reason: "number is not finite" });
		return fallback;
	}

	if (typeof value === "string") {
		const trimmedValue = value.trim();

		if (trimmedValue === "") {
			trace.end({ result: fallback, source: "fallback", reason: "string is blank" });
			return fallback;
		}

		const parsed = Number(trimmedValue);

		if (Number.isFinite(parsed)) {
			trace.end({ result: parsed, source: "parsed string" });
			return parsed;
		}

		trace.end({ result: fallback, source: "fallback", reason: "string could not be parsed" });
		return fallback;
	}

	trace.end({ result: fallback, source: "fallback", reason: "unsupported value type" });
	return fallback;
}

export function safeInteger(value: unknown, fallback = 0): number {
	const trace = startTrace(TRACE_SCOPE, "safeInteger", {
		value,
		valueType: typeof value,
		fallback,
	});

	const parsed = numberValue(value, fallback);

	if (Number.isInteger(parsed)) {
		trace.end({ result: parsed, source: "parsed integer" });
		return parsed;
	}

	trace.end({ result: fallback, source: "fallback", reason: "parsed value is not an integer", parsed });
	return fallback;
}
