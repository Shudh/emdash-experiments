import type { RuntimeEnv } from "./runtime-env.js";
import { envString } from "./runtime-env.js";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export interface TurnstileResult {
	success: boolean;
	errorCodes: string[];
}

export function publicTurnstileSiteKeyFromEnv(env: RuntimeEnv | undefined): string | undefined {
	return envString(
		env,
		"HANDOVERNOW_TURNSTILE_SITE_KEY",
		"TURNSTILE_SITE_KEY",
		"CF_TURNSTILE_SITE_KEY",
	);
}

export function turnstileSecretKeyFromEnv(env: RuntimeEnv | undefined): string | undefined {
	return envString(
		env,
		"HANDOVERNOW_TURNSTILE_SECRET_KEY",
		"TURNSTILE_SECRET_KEY",
		"CF_TURNSTILE_SECRET_KEY",
	);
}

export async function verifyTurnstile(
	token: string,
	secretKey: string,
	httpFetch: (url: string, init?: RequestInit) => Promise<Response>,
	remoteIp?: string | null,
	idempotencyKey?: string | null,
): Promise<TurnstileResult> {
	const body: Record<string, string> = {
		secret: secretKey,
		response: token,
	};

	if (remoteIp) {
		body.remoteip = remoteIp;
	}

	if (idempotencyKey) {
		body.idempotency_key = idempotencyKey;
	}

	const response = await httpFetch(VERIFY_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});

	const data = (await response.json()) as {
		success?: boolean;
		"error-codes"?: string[];
	};

	return {
		success: data.success === true,
		errorCodes: Array.isArray(data["error-codes"]) ? data["error-codes"] : [],
	};
}
