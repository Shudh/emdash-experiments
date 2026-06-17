import { DomainError } from "../../domain/types.js";
import { verifyHumanCheckAnswer } from "./human-check.js";
import type { RuntimeEnv } from "./runtime-env.js";
import { turnstileSecretKeyFromEnv, verifyTurnstile } from "./turnstile.js";
import { getWf1ClientIp } from "./rate-limit.js";

const DEFAULT_MIN_FORM_SECONDS = 8;

export type SharedFormGuardAction = "lead_prescreen" | "asset_creation";

export type SharedFormGuardInput = {
	request: Request;
	body: Record<string, unknown>;
	env?: RuntimeEnv;
	assetId?: string;
	action: SharedFormGuardAction;
	minSeconds?: number;
	requirePhone?: boolean;
	requireHumanCheck?: boolean;
	requireTurnstile?: boolean;
};

export type SharedFormGuardResult = {
	clientIp: string | null;
	turnstileChecked: boolean;
};

export async function validateSharedFormGuard(input: SharedFormGuardInput): Promise<SharedFormGuardResult> {
	rejectHoneypot(input.body);
	if (input.requirePhone === true) rejectMissingPhone(input.body);
	rejectTooFastForm(input.body, input.minSeconds ?? DEFAULT_MIN_FORM_SECONDS);

	if (input.requireHumanCheck === true) {
		await rejectInvalidHumanCheck(input);
	}

	const turnstileChecked = await rejectInvalidTurnstile(input);

	return {
		clientIp: getWf1ClientIp(input.request),
		turnstileChecked,
	};
}

export function rejectHoneypot(body: Record<string, unknown>): void {
	const honeypot = stringValue(body._hp) || stringValue(body.companyWebsite) || stringValue(body.website);
	if (!honeypot) return;

	throw new DomainError(
		"FORM_SPAM_REJECTED",
		"The request could not be submitted.",
		403,
	);
}

export function rejectMissingPhone(body: Record<string, unknown>): void {
	const phone = normalizePhone(body.phone);
	if (!phone || phone.length < 8) {
		throw new DomainError(
			"PHONE_REQUIRED",
			"Phone / WhatsApp number is required before applying.",
			422,
		);
	}
}

export function rejectTooFastForm(body: Record<string, unknown>, minSeconds = DEFAULT_MIN_FORM_SECONDS): void {
	const startedAt = body.prescreenStartedAt ?? body.formStartedAt ?? body.startedAt;

	if (startedAt === undefined || startedAt === null || startedAt === "") {
		throw new DomainError(
			"FORM_TIME_REQUIRED",
			"Form timing is required before submitting.",
			422,
		);
	}

	const timestamp = typeof startedAt === "number" ? startedAt : Date.parse(String(startedAt));

	if (!Number.isFinite(timestamp)) {
		throw new DomainError(
			"INVALID_FORM_TIME",
			"Form timing is invalid.",
			422,
		);
	}

	const elapsedSeconds = (Date.now() - timestamp) / 1000;
	if (elapsedSeconds < minSeconds) {
		throw new DomainError(
			"FORM_TOO_FAST",
			"Please review the form before submitting.",
			429,
		);
	}
}

export async function rejectInvalidHumanCheck(input: SharedFormGuardInput): Promise<void> {
	const humanCheck = recordValue(input.body.humanCheck);
	if (!humanCheck) {
		throw new DomainError(
			"HUMAN_CHECK_REQUIRED",
			"Human check is required before submitting.",
			422,
		);
	}

	if (!input.assetId) {
		throw new DomainError(
			"HUMAN_CHECK_TARGET_REQUIRED",
			"Human check target is missing.",
			422,
		);
	}

	const valid = await verifyHumanCheckAnswer({
		challenge: humanCheck.challenge,
		answer: humanCheck.answer,
		assetId: input.assetId,
		env: input.env,
	});

	if (!valid) {
		throw new DomainError(
			"HUMAN_CHECK_FAILED",
			"Human check failed. Please try again.",
			403,
		);
	}
}

export async function rejectInvalidTurnstile(input: SharedFormGuardInput): Promise<boolean> {
	const required = input.requireTurnstile !== false;
	const secretKey = turnstileSecretKeyFromEnv(input.env);

	if (!secretKey) {
		if (!required) return false;
		throw new DomainError(
			"TURNSTILE_NOT_CONFIGURED",
			"Spam verification is not configured for this form.",
			500,
		);
	}

	const token =
		stringValue(input.body.turnstileToken) ||
		stringValue(input.body["cf-turnstile-response"]);

	if (!token) {
		throw new DomainError(
			"TURNSTILE_REQUIRED",
			"Spam verification is required before submitting.",
			403,
		);
	}

	const result = await verifyTurnstile(
		token,
		secretKey,
		fetch,
		getWf1ClientIp(input.request),
		crypto.randomUUID(),
	);

	if (!result.success) {
		throw new DomainError(
			"TURNSTILE_FAILED",
			"Spam verification failed. Please try again.",
			403,
		);
	}

	return true;
}

export function stringValue(value: unknown): string {
	return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

export function recordValue(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

export function normalizePhone(value: unknown): string {
	const raw = typeof value === "string" || typeof value === "number" ? String(value) : "";
	return raw.replace(/[^\d+]/g, "").replace(/^00/, "+");
}

export function normalizeEmail(value: unknown): string {
	return typeof value === "string" ? value.trim().toLowerCase() : "";
}
