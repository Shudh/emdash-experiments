import type { PrescreenConfig, PrescreenState } from "./types";
import { isObjectRecord, safeInteger, stringValue } from "./objectUtils";
import { startTrace } from "./debugTrace";

const TRACE_SCOPE = "prescreenStorage";

function browserWindowIsAvailable(): boolean {
	return typeof window !== "undefined";
}

function localStorageIsAvailable(): boolean {
	if (!browserWindowIsAvailable()) {
		return false;
	}

	try {
		return window.localStorage !== undefined && window.localStorage !== null;
	} catch {
		return false;
	}
}

export function createEmptyPrescreenState(config: PrescreenConfig): PrescreenState {
	return {
		startedAt: new Date().toISOString(),
		index: 0,
		answers: {},
		humanCheckAnswer: "",
		turnstileToken: "",
		challengeNonce: config.humanCheckChallenge.nonce,
	};
}

function removeStoredValue(storageKey: string, reason: string): void {
	const trace = startTrace(TRACE_SCOPE, "removeStoredValue", { storageKey, reason });

	if (!localStorageIsAvailable()) {
		trace.end({ removed: false, reason: "localStorage unavailable" });
		return;
	}

	try {
		window.localStorage.removeItem(storageKey);
		trace.end({ removed: true });
	} catch (error) {
		trace.fail(error, { removed: false });
	}
}

function readStoredRawValue(storageKey: string): string | null {
	if (!localStorageIsAvailable()) {
		return null;
	}

	try {
		return window.localStorage.getItem(storageKey);
	} catch {
		return null;
	}
}

function parseStoredState(rawValue: string, storageKey: string): Record<string, unknown> | null {
	try {
		const parsedValue = JSON.parse(rawValue);

		if (!isObjectRecord(parsedValue)) {
			removeStoredValue(storageKey, "stored prescreen state is not an object");
			return null;
		}

		return parsedValue;
	} catch {
		removeStoredValue(storageKey, "stored prescreen state is invalid JSON");
		return null;
	}
}

function normalizeAnswers(value: unknown): Record<string, string> {
	const normalizedAnswers: Record<string, string> = {};

	if (!isObjectRecord(value)) {
		return normalizedAnswers;
	}

	for (const [key, answerValue] of Object.entries(value)) {
		if (typeof answerValue === "string") {
			normalizedAnswers[key] = answerValue;
		}
	}

	return normalizedAnswers;
}

function challengeNonceMatchesCurrentConfig(parsedState: Record<string, unknown>, config: PrescreenConfig): boolean {
	return stringValue(parsedState.challengeNonce) === config.humanCheckChallenge.nonce;
}

function normalizedIndex(parsedState: Record<string, unknown>, config: PrescreenConfig): number {
	const parsedIndex = safeInteger(parsedState.index, 0);
	const nonNegativeIndex = Math.max(0, parsedIndex);
	return Math.min(nonNegativeIndex, config.questions.length);
}

function normalizeStartedAt(parsedState: Record<string, unknown>): string {
	const fallbackStartedAt = new Date().toISOString();
	const startedAt = stringValue(parsedState.startedAt, fallbackStartedAt);
	const timestamp = Date.parse(startedAt);

	if (!Number.isFinite(timestamp)) {
		return fallbackStartedAt;
	}

	return startedAt;
}

function normalizeHumanCheckAnswer(parsedState: Record<string, unknown>, challengeMatches: boolean): string {
	if (!challengeMatches) {
		return "";
	}

	return stringValue(parsedState.humanCheckAnswer);
}

function normalizeTurnstileToken(parsedState: Record<string, unknown>, challengeMatches: boolean): string {
	if (!challengeMatches) {
		return "";
	}

	return stringValue(parsedState.turnstileToken);
}

function normalizeParsedState(parsedState: Record<string, unknown>, config: PrescreenConfig): PrescreenState {
	const challengeMatches = challengeNonceMatchesCurrentConfig(parsedState, config);

	return {
		startedAt: normalizeStartedAt(parsedState),
		index: normalizedIndex(parsedState, config),
		answers: normalizeAnswers(parsedState.answers),
		humanCheckAnswer: normalizeHumanCheckAnswer(parsedState, challengeMatches),
		turnstileToken: normalizeTurnstileToken(parsedState, challengeMatches),
		challengeNonce: config.humanCheckChallenge.nonce,
	};
}

export function loadPrescreenState(config: PrescreenConfig): PrescreenState {
	const trace = startTrace(TRACE_SCOPE, "loadPrescreenState", {
		assetId: config.assetId,
		storageKey: config.storageKey,
	});

	if (!browserWindowIsAvailable()) {
		const emptyState = createEmptyPrescreenState(config);
		trace.end({ source: "empty state", reason: "browser window unavailable" });
		return emptyState;
	}

	const rawValue = readStoredRawValue(config.storageKey);

	if (rawValue === null) {
		const emptyState = createEmptyPrescreenState(config);
		trace.end({ source: "empty state", reason: "no stored value" });
		return emptyState;
	}

	const parsedState = parseStoredState(rawValue, config.storageKey);

	if (parsedState === null) {
		const emptyState = createEmptyPrescreenState(config);
		trace.end({ source: "empty state", reason: "stored value could not be parsed" });
		return emptyState;
	}

	const normalizedState = normalizeParsedState(parsedState, config);
	trace.end({ source: "stored state", index: normalizedState.index, answerCount: Object.keys(normalizedState.answers).length });
	return normalizedState;
}

function serializePrescreenState(state: PrescreenState): string | null {
	try {
		return JSON.stringify(state);
	} catch {
		return null;
	}
}

export function savePrescreenState(config: PrescreenConfig, state: PrescreenState): void {
	const trace = startTrace(TRACE_SCOPE, "savePrescreenState", {
		assetId: config.assetId,
		storageKey: config.storageKey,
		index: state.index,
		answerCount: Object.keys(state.answers).length,
	});

	if (!localStorageIsAvailable()) {
		trace.end({ saved: false, reason: "localStorage unavailable" });
		return;
	}

	const serialized = serializePrescreenState(state);

	if (serialized === null) {
		trace.end({ saved: false, reason: "state could not be serialized" });
		return;
	}

	try {
		window.localStorage.setItem(config.storageKey, serialized);
		trace.end({ saved: true, serializedLength: serialized.length });
	} catch (error) {
		trace.fail(error, { saved: false, serializedLength: serialized.length });
	}
}

export function clearPrescreenState(config: PrescreenConfig): void {
	removeStoredValue(config.storageKey, "prescreen cleared by application");
}
