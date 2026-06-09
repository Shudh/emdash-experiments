import type { MediaUploadResult, Wf1Workspace, Wf1WorkspaceRoutes } from "./types";
import { isObjectRecord, objectValue, stringValue } from "./objectUtils";
import { startTrace } from "./debugTrace";

const TRACE_SCOPE = "wf1Api";

export type ApiSuccess<T> = {
	ok: true;
	payload: T;
};

export type ApiFailure = {
	ok: false;
	error: string;
	payload: unknown;
};

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

type HttpMethod = "GET" | "POST";

function requestHeadersForJson(): HeadersInit {
	return {
		"Content-Type": "application/json",
		"X-EmDash-Request": "1",
	};
}

function requestHeadersForNonJsonBody(): HeadersInit {
	return {
		"X-EmDash-Request": "1",
	};
}

function unknownErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof Error && error.message.trim() !== "") {
		return error.message;
	}

	const message = String(error).trim();
	return message === "" ? fallback : message;
}

async function readPayload(response: Response): Promise<unknown> {
	const trace = startTrace(TRACE_SCOPE, "readPayload", {
		status: response.status,
		statusText: response.statusText,
		ok: response.ok,
	});

	const text = await response.text();
	const trimmedText = text.trim();

	if (trimmedText === "") {
		trace.end({ payloadKind: "empty object" });
		return {};
	}

	try {
		const parsedPayload = JSON.parse(text);
		trace.end({ payloadKind: "json", textLength: text.length });
		return parsedPayload;
	} catch (error) {
		const rawPayload = { raw: text };
		trace.fail(error, { payloadKind: "raw text fallback", textLength: text.length });
		return rawPayload;
	}
}

function messageFromNestedErrorObject(payload: Record<string, unknown>): string {
	const errorObject = objectValue(payload.error);
	const message = stringValue(errorObject.message).trim();

	if (message !== "") {
		return message;
	}

	const code = stringValue(errorObject.code).trim();
	return code;
}

function messageFromTopLevelPayload(payload: Record<string, unknown>): string {
	return stringValue(payload.message).trim();
}

function errorMessageFromPayload(payload: unknown, fallback: string): string {
	const trace = startTrace(TRACE_SCOPE, "errorMessageFromPayload", {
		fallback,
		payloadType: typeof payload,
	});

	if (!isObjectRecord(payload)) {
		trace.end({ source: "fallback", message: fallback, reason: "payload is not an object record" });
		return fallback;
	}

	const nestedErrorMessage = messageFromNestedErrorObject(payload);

	if (nestedErrorMessage !== "") {
		trace.end({ source: "nested error object", message: nestedErrorMessage });
		return nestedErrorMessage;
	}

	const topLevelMessage = messageFromTopLevelPayload(payload);

	if (topLevelMessage !== "") {
		trace.end({ source: "top level message", message: topLevelMessage });
		return topLevelMessage;
	}

	trace.end({ source: "fallback", message: fallback, reason: "no usable message found" });
	return fallback;
}

function redirectFromObjectField(payload: Record<string, unknown>, fieldName: string): string {
	const fieldObject = objectValue(payload[fieldName]);
	const redirectTo = stringValue(fieldObject.redirectTo).trim();

	if (redirectTo.startsWith("/")) {
		return redirectTo;
	}

	return "";
}

export function redirectToFromPayload(payload: unknown): string {
	const trace = startTrace(TRACE_SCOPE, "redirectToFromPayload", {
		payloadType: typeof payload,
	});

	if (!isObjectRecord(payload)) {
		trace.end({ redirectTo: "", reason: "payload is not an object record" });
		return "";
	}

	const directRedirect = stringValue(payload.redirectTo).trim();

	if (directRedirect.startsWith("/")) {
		trace.end({ source: "payload.redirectTo", redirectTo: directRedirect });
		return directRedirect;
	}

	const dataRedirect = redirectFromObjectField(payload, "data");

	if (dataRedirect !== "") {
		trace.end({ source: "payload.data.redirectTo", redirectTo: dataRedirect });
		return dataRedirect;
	}

	const itemRedirect = redirectFromObjectField(payload, "item");

	if (itemRedirect !== "") {
		trace.end({ source: "payload.item.redirectTo", redirectTo: itemRedirect });
		return itemRedirect;
	}

	trace.end({ redirectTo: "", reason: "no local redirect found" });
	return "";
}

async function fetchJsonRequest<TResult>(
	method: HttpMethod,
	url: string,
	body: Record<string, unknown> | null,
): Promise<ApiResult<TResult>> {
	const trace = startTrace(TRACE_SCOPE, "fetchJsonRequest", {
		method,
		url,
		hasBody: body !== null,
	});

	const requestInit: RequestInit = {
		method,
		credentials: "same-origin",
		headers: requestHeadersForJson(),
	};

	if (body !== null) {
		requestInit.body = JSON.stringify(body);
	}

	let response: Response;
	let payload: unknown;

	try {
		response = await fetch(url, requestInit);
		payload = await readPayload(response);
	} catch (error) {
		const errorMessage = unknownErrorMessage(error, "Request failed before the server returned a response.");

		trace.fail(error, {
			ok: false,
			error: errorMessage,
		});

		return {
			ok: false,
			error: errorMessage,
			payload: {},
		};
	}

	if (!response.ok) {
		const errorMessage = errorMessageFromPayload(payload, "Request failed.");

		trace.end({ ok: false, status: response.status, error: errorMessage });

		return {
			ok: false,
			error: errorMessage,
			payload,
		};
	}

	trace.end({ ok: true, status: response.status });

	return {
		ok: true,
		payload: payload as TResult,
	};
}

export async function postJson<TPayload extends Record<string, unknown>, TResult = unknown>(
	url: string,
	body: TPayload,
): Promise<ApiResult<TResult>> {
	const trace = startTrace(TRACE_SCOPE, "postJson", {
		url,
		bodyKeys: Object.keys(body),
	});

	const result = await fetchJsonRequest<TResult>("POST", url, body);

	trace.end({ ok: result.ok });
	return result;
}

export async function getJson<TResult = unknown>(url: string): Promise<ApiResult<TResult>> {
	const trace = startTrace(TRACE_SCOPE, "getJson", { url });

	const result = await fetchJsonRequest<unknown>("GET", url, null);

	if (!result.ok) {
		trace.end({ ok: false, error: result.error });
		return result;
	}

	const payload = result.payload;

	if (isObjectRecord(payload)) {
		const payloadUsesOkDataWrapper = payload.ok === true && "data" in payload;

		if (payloadUsesOkDataWrapper) {
			trace.end({ ok: true, payloadShape: "ok-data wrapper" });

			return {
				ok: true,
				payload: payload.data as TResult,
			};
		}
	}

	trace.end({ ok: true, payloadShape: "direct payload" });

	return {
		ok: true,
		payload: payload as TResult,
	};
}

function fileTypeIsAllowed(file: File): boolean {
	const allowedTypes = new Set<string>([
		"application/pdf",
		"image/jpeg",
		"image/png",
		"image/webp",
	]);

	return allowedTypes.has(file.type) || file.type.startsWith("image/");
}

function fileSizeIsAllowed(file: File): boolean {
	const maxSizeBytes = 10 * 1024 * 1024;
	return file.size <= maxSizeBytes;
}

function mediaResultFromPayload(payload: unknown, file: File): MediaUploadResult {
	const payloadRecord = objectValue(payload);
	const data = objectValue(payloadRecord.data);
	const itemFromData = objectValue(data.item);
	const itemFromPayload = objectValue(payloadRecord.item);

	let item: Record<string, unknown>;

	if (Object.keys(itemFromData).length > 0) {
		item = itemFromData;
	} else if (Object.keys(itemFromPayload).length > 0) {
		item = itemFromPayload;
	} else {
		item = payloadRecord;
	}

	return {
		mediaId: stringValue(item.id),
		storageKey: stringValue(item.storageKey),
		mimeType: stringValue(item.mimeType, file.type),
		filename: stringValue(item.filename, file.name),
		url: stringValue(item.url),
	};
}

function mediaResultHasUsableReference(result: MediaUploadResult): boolean {
	return result.mediaId !== "" || result.storageKey !== "";
}

export async function uploadMedia(file: File, mediaUploadUrl: string): Promise<ApiResult<MediaUploadResult>> {
	const trace = startTrace(TRACE_SCOPE, "uploadMedia", {
		mediaUploadUrl,
		fileName: file.name,
		fileType: file.type,
		fileSize: file.size,
	});

	if (!fileTypeIsAllowed(file)) {
		const error = "Only image files and PDFs are allowed.";
		trace.end({ ok: false, error });
		return { ok: false, error, payload: {} };
	}

	if (!fileSizeIsAllowed(file)) {
		const error = "File is too large. Maximum allowed size is 10 MB.";
		trace.end({ ok: false, error });
		return { ok: false, error, payload: {} };
	}

	const formData = new FormData();
	formData.append("file", file);

	let response: Response;
	let payload: unknown;

	try {
		response = await fetch(mediaUploadUrl, {
			method: "POST",
			credentials: "same-origin",
			headers: requestHeadersForNonJsonBody(),
			body: formData,
		});

		payload = await readPayload(response);
	} catch (error) {
		const message = unknownErrorMessage(error, "Media upload failed before the server returned a response.");
		trace.fail(error, { ok: false, error: message });
		return { ok: false, error: message, payload: {} };
	}

	if (!response.ok) {
		const error = errorMessageFromPayload(payload, "Media upload failed.");
		trace.end({ ok: false, status: response.status, error });
		return { ok: false, error, payload };
	}

	const result = mediaResultFromPayload(payload, file);

	if (!mediaResultHasUsableReference(result)) {
		const error = "Media upload succeeded but returned no usable media reference.";
		trace.end({ ok: false, error });
		return { ok: false, error, payload };
	}

	trace.end({ ok: true, mediaId: result.mediaId, storageKey: result.storageKey });
	return { ok: true, payload: result };
}

export async function loadWorkspace(routes: Wf1WorkspaceRoutes): Promise<ApiResult<Wf1Workspace>> {
	const trace = startTrace(TRACE_SCOPE, "loadWorkspace", { workspaceUrl: routes.workspace });
	const result = await getJson<Wf1Workspace>(routes.workspace);
	trace.end({ ok: result.ok });
	return result;
}

export async function runWorkflowAction(
	routes: Wf1WorkspaceRoutes,
	workflowInstanceId: string,
	actionId: string,
): Promise<ApiResult<unknown>> {
	const body = { workflowInstanceId, actionId };
	return postJson(routes.workflowActions, body);
}

export async function createWorkflowCard(
	routes: Wf1WorkspaceRoutes,
	input: {
		workflowInstanceId: string;
		cardType: string;
		prompt: string;
		cardSpec: Record<string, unknown>;
	},
): Promise<ApiResult<unknown>> {
	const body = {
		workflowInstanceId: input.workflowInstanceId,
		cardType: input.cardType,
		prompt: input.prompt,
		cardSpec: input.cardSpec,
	};

	return postJson(routes.workflowCards, body);
}

export async function answerWorkflowCard(
	routes: Wf1WorkspaceRoutes,
	input: {
		cardId: string;
		answer: Record<string, unknown>;
		attachments: MediaUploadResult[];
	},
): Promise<ApiResult<unknown>> {
	const attachments = input.attachments.map((attachment) => {
		return {
			mediaId: attachment.mediaId,
			storageKey: attachment.storageKey,
			mimeType: attachment.mimeType,
			filename: attachment.filename,
			url: attachment.url,
		};
	});

	const encodedCardId = encodeURIComponent(input.cardId);
	const answerUrl = `${routes.workflowCardAnswerBase}/${encodedCardId}/answer`;
	const body = { answer: input.answer, attachments };

	return postJson(answerUrl, body);
}

export async function expressInterest(action: string, body: Record<string, unknown>): Promise<ApiResult<unknown>> {
	return postJson(action, body);
}
