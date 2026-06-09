import { useEffect, useRef, useState } from "react";
import { startTrace } from "./debugTrace";

const TRACE_SCOPE = "TurnstileBox";
const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileRenderOptions = {
	sitekey: string;
	appearance: "interaction-only";
	callback: (token: string) => void;
	"expired-callback": () => void;
	"error-callback": () => void;
};

type TurnstileApi = {
	render: (element: HTMLElement, options: TurnstileRenderOptions) => string;
};

type BrowserWindowWithTurnstile = Window & {
	turnstile?: TurnstileApi;
};

type TurnstileBoxProps = {
	siteKey: string;
	onToken: (token: string) => void;
	onError: (message: string) => void;
};

function browserWindowWithTurnstile(): BrowserWindowWithTurnstile {
	return window as BrowserWindowWithTurnstile;
}

function existingTurnstileScriptElement(): HTMLScriptElement | null {
	const selector = `script[src="${TURNSTILE_SCRIPT_URL}"]`;
	return document.querySelector<HTMLScriptElement>(selector);
}

function turnstileApiIsAvailable(): boolean {
	const typedWindow = browserWindowWithTurnstile();
	return typedWindow.turnstile !== undefined;
}

function addScriptLoadListeners(
	scriptElement: HTMLScriptElement,
	resolve: () => void,
	reject: (reason: Error) => void,
): void {
	function handleLoad(): void {
		resolve();
	}

	function handleError(): void {
		reject(new Error("Turnstile failed to load."));
	}

	scriptElement.addEventListener("load", handleLoad, { once: true });
	scriptElement.addEventListener("error", handleError, { once: true });
}

function createTurnstileScriptElement(): HTMLScriptElement {
	const scriptElement = document.createElement("script");
	scriptElement.src = TURNSTILE_SCRIPT_URL;
	scriptElement.async = true;
	return scriptElement;
}

function appendScriptToDocumentHead(scriptElement: HTMLScriptElement): void {
	document.head.appendChild(scriptElement);
}

function loadTurnstileScript(): Promise<void> {
	const trace = startTrace(TRACE_SCOPE, "loadTurnstileScript", { scriptUrl: TURNSTILE_SCRIPT_URL });

	return new Promise((resolve, reject) => {
		const existingScriptElement = existingTurnstileScriptElement();

		if (existingScriptElement !== null) {
			if (turnstileApiIsAvailable()) {
				trace.end({ loaded: true, source: "existing script and API already available" });
				resolve();
				return;
			}

			addScriptLoadListeners(existingScriptElement, resolve, reject);
			trace.end({ loaded: false, source: "existing script still loading" });
			return;
		}

		const scriptElement = createTurnstileScriptElement();
		addScriptLoadListeners(scriptElement, resolve, reject);
		appendScriptToDocumentHead(scriptElement);
		trace.end({ loaded: false, source: "new script appended" });
	});
}

function messageFromUnknownError(error: unknown, fallback: string): string {
	if (error instanceof Error && error.message.trim() !== "") {
		return error.message;
	}

	const message = String(error).trim();
	return message === "" ? fallback : message;
}

function renderTurnstileWidget(
	container: HTMLElement,
	siteKey: string,
	onToken: (token: string) => void,
	onError: (message: string) => void,
	setStatus: (status: string) => void,
): string {
	const typedWindow = browserWindowWithTurnstile();
	const turnstileApi = typedWindow.turnstile;

	if (turnstileApi === undefined) {
		throw new Error("Turnstile API is unavailable.");
	}

	return turnstileApi.render(container, {
		sitekey: siteKey,
		appearance: "interaction-only",
		callback: (token: string) => {
			setStatus("Spam verification complete.");
			onToken(token);
		},
		"expired-callback": () => {
			setStatus("Spam verification expired. Please verify again.");
			onToken("");
		},
		"error-callback": () => {
			const errorMessage = "Spam verification failed. Please retry.";
			setStatus(errorMessage);
			onToken("");
			onError(errorMessage);
		},
	});
}

function initialStatusForSiteKey(siteKey: string): string {
	return siteKey === "" ? "" : "Loading spam verification...";
}

async function loadScriptAndRenderWidget(
	container: HTMLElement,
	siteKey: string,
	onToken: (token: string) => void,
	onError: (message: string) => void,
	setStatus: (status: string) => void,
): Promise<void> {
	const trace = startTrace(TRACE_SCOPE, "loadScriptAndRenderWidget", { siteKeyPresent: siteKey !== "" });

	try {
		await loadTurnstileScript();
		renderTurnstileWidget(container, siteKey, onToken, onError, setStatus);
		trace.end({ completed: true });
	} catch (error: unknown) {
		const message = messageFromUnknownError(error, "Turnstile failed to load.");
		setStatus(message);
		onError(message);
		trace.fail(error, { completed: false, message });
	}
}

export default function TurnstileBox(props: TurnstileBoxProps) {
	const siteKey = props.siteKey;
	const onToken = props.onToken;
	const onError = props.onError;

	const containerRef = useRef<HTMLDivElement | null>(null);
	const renderedRef = useRef(false);
	const [status, setStatus] = useState(() => initialStatusForSiteKey(siteKey));

	useEffect(() => {
		const trace = startTrace(TRACE_SCOPE, "useEffect", {
			siteKeyPresent: siteKey !== "",
			renderedAlready: renderedRef.current,
			containerAvailable: containerRef.current !== null,
		});

		if (siteKey === "") {
			trace.end({ action: "skip", reason: "site key is blank" });
			return;
		}

		if (renderedRef.current) {
			trace.end({ action: "skip", reason: "widget already rendered" });
			return;
		}

		const container = containerRef.current;

		if (container === null) {
			trace.end({ action: "skip", reason: "container ref is not available" });
			return;
		}

		renderedRef.current = true;
		void loadScriptAndRenderWidget(container, siteKey, onToken, onError, setStatus);
		trace.end({ action: "started script load/render flow" });
	}, [siteKey, onToken, onError]);

	if (siteKey === "") {
		return null;
	}

	return (
		<div className="hn-turnstile-wrap">
			<div ref={containerRef} />
			{status !== "" ? <p className="hn-chatbotify-muted">{status}</p> : null}
		</div>
	);
}
