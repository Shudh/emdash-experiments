export type TraceData = Record<string, unknown>;

const WF1_CHATBOTIFY_TRACE_ALWAYS_ENABLED = false;
const WF1_CHATBOTIFY_TRACE_STORAGE_KEY = "WF1_CHATBOTIFY_TRACE";
const WF1_CHATBOTIFY_TRACE_QUERY_PARAM = "wf1Trace";

function browserWindowIsAvailable(): boolean {
	return typeof window !== "undefined";
}

function traceEnabledByQueryString(): boolean {
	if (!browserWindowIsAvailable()) {
		return false;
	}

	try {
		const url = new URL(window.location.href);
		return url.searchParams.get(WF1_CHATBOTIFY_TRACE_QUERY_PARAM) === "1";
	} catch {
		return false;
	}
}

function traceEnabledByLocalStorage(): boolean {
	if (!browserWindowIsAvailable()) {
		return false;
	}

	try {
		return window.localStorage.getItem(WF1_CHATBOTIFY_TRACE_STORAGE_KEY) === "1";
	} catch {
		return false;
	}
}

function traceIsEnabled(): boolean {
	return (
		WF1_CHATBOTIFY_TRACE_ALWAYS_ENABLED ||
		traceEnabledByQueryString() ||
		traceEnabledByLocalStorage()
	);
}

function nowInMilliseconds(): number {
	if (typeof performance !== "undefined" && typeof performance.now === "function") {
		return performance.now();
	}

	return Date.now();
}

function safeJsonStringify(value: unknown): string {
	try {
		return JSON.stringify(value);
	} catch (error) {
		if (error instanceof Error) {
			return `[unserializable: ${error.message}]`;
		}

		return "[unserializable value]";
	}
}

function printableData(data: TraceData | undefined): string {
	if (data === undefined) {
		return "";
	}

	return safeJsonStringify(data);
}

export class Wf1TraceSpan {
	private readonly scope: string;
	private readonly methodName: string;
	private readonly startedAtMilliseconds: number;

	public constructor(scope: string, methodName: string, params?: TraceData) {
		this.scope = scope;
		this.methodName = methodName;
		this.startedAtMilliseconds = nowInMilliseconds();

		if (traceIsEnabled()) {
			console.info(`[WF1_CHATBOTIFY_TRACE] START ${this.label()}`, printableData(params));
		}
	}

	public end(result?: TraceData): void {
		if (!traceIsEnabled()) {
			return;
		}

		const elapsedMilliseconds = this.elapsedMilliseconds();

		console.info(
			`[WF1_CHATBOTIFY_TRACE] END ${this.label()} ${elapsedMilliseconds.toFixed(2)}ms`,
			printableData(result),
		);
	}

	public fail(error: unknown, result?: TraceData): void {
		if (!traceIsEnabled()) {
			return;
		}

		const elapsedMilliseconds = this.elapsedMilliseconds();
		const errorMessage = error instanceof Error ? error.message : String(error);

		console.error(
			`[WF1_CHATBOTIFY_TRACE] FAIL ${this.label()} ${elapsedMilliseconds.toFixed(2)}ms ${errorMessage}`,
			printableData(result),
		);
	}

	private label(): string {
		return `${this.scope}.${this.methodName}`;
	}

	private elapsedMilliseconds(): number {
		return nowInMilliseconds() - this.startedAtMilliseconds;
	}
}

export function startTrace(scope: string, methodName: string, params?: TraceData): Wf1TraceSpan {
	return new Wf1TraceSpan(scope, methodName, params);
}

export function isWf1ChatbotifyTraceEnabled(): boolean {
	return traceIsEnabled();
}

export function enableWf1ChatbotifyTraceForBrowser(): void {
	if (!browserWindowIsAvailable()) {
		return;
	}

	window.localStorage.setItem(WF1_CHATBOTIFY_TRACE_STORAGE_KEY, "1");
}

export function disableWf1ChatbotifyTraceForBrowser(): void {
	if (!browserWindowIsAvailable()) {
		return;
	}

	window.localStorage.removeItem(WF1_CHATBOTIFY_TRACE_STORAGE_KEY);
}
