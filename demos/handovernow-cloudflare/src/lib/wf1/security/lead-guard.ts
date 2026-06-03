import type { DomainStore, UserContext } from "../../domain/types.js";
import { DomainError, asString } from "../../domain/types.js";
import { WORKFLOW_RENTAL_COLLECTIONS } from "../store/collections.js";
import { verifyHumanCheckAnswer } from "./human-check.js";
import type { RuntimeEnv } from "./runtime-env.js";
import { turnstileSecretKeyFromEnv, verifyTurnstile } from "./turnstile.js";

const MIN_PRESCREEN_SECONDS = 8;

export type ValidateLeadProtectionInput = {
	store: DomainStore;
	request: Request;
	user: UserContext;
	assetId: string;
	body: Record<string, unknown>;
	env?: RuntimeEnv;
};

export async function validateLeadProtection(input: ValidateLeadProtectionInput): Promise<void> {
	rejectHoneypot(input.body);
	rejectMissingPhone(input.body);
	rejectTooFastPrescreen(input.body);
	await rejectInvalidHumanCheck(input);
	await rejectInvalidTurnstile(input);
	await rejectDuplicateApplicantContact(input);
}

function rejectHoneypot(body: Record<string, unknown>): void {
	const honeypot = stringValue(body._hp) || stringValue(body.companyWebsite);
	if (!honeypot) return;

	throw new DomainError(
		"LEAD_SPAM_REJECTED",
		"Application could not be submitted.",
		403,
	);
}

function rejectMissingPhone(body: Record<string, unknown>): void {
	const phone = normalizePhone(body.phone);
	if (!phone || phone.length < 8) {
		throw new DomainError(
			"PHONE_REQUIRED",
			"Phone / WhatsApp number is required before applying.",
			422,
		);
	}
}

function rejectTooFastPrescreen(body: Record<string, unknown>): void {
	const startedAt = body.prescreenStartedAt;

	if (startedAt === undefined || startedAt === null || startedAt === "") {
		throw new DomainError(
			"PRESCREEN_TIME_REQUIRED",
			"Prescreen timing is required before submitting.",
			422,
		);
	}

	const timestamp =
		typeof startedAt === "number" ? startedAt : Date.parse(String(startedAt));

	if (!Number.isFinite(timestamp)) {
		throw new DomainError(
			"INVALID_PRESCREEN_TIME",
			"Prescreen timing is invalid.",
			422,
		);
	}

	const elapsedSeconds = (Date.now() - timestamp) / 1000;
	if (elapsedSeconds < MIN_PRESCREEN_SECONDS) {
		throw new DomainError(
			"PRESCREEN_TOO_FAST",
			"Please complete the screening before submitting.",
			429,
		);
	}
}

async function rejectInvalidHumanCheck(input: ValidateLeadProtectionInput): Promise<void> {
	const humanCheck = recordValue(input.body.humanCheck);
	if (!humanCheck) {
		throw new DomainError(
			"HUMAN_CHECK_REQUIRED",
			"Human check is required before applying.",
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

async function rejectInvalidTurnstile(input: ValidateLeadProtectionInput): Promise<void> {
	const secretKey = turnstileSecretKeyFromEnv(input.env);
	if (!secretKey) return;

	const token =
		stringValue(input.body.turnstileToken) ||
		stringValue(input.body["cf-turnstile-response"]);

	if (!token) {
		throw new DomainError(
			"TURNSTILE_REQUIRED",
			"Spam verification is required before applying.",
			403,
		);
	}

	const result = await verifyTurnstile(
		token,
		secretKey,
		fetch,
		clientIp(input.request),
	);

	if (!result.success) {
		throw new DomainError(
			"TURNSTILE_FAILED",
			"Spam verification failed. Please try again.",
			403,
		);
	}
}

async function rejectDuplicateApplicantContact(input: ValidateLeadProtectionInput): Promise<void> {
	const phone = normalizePhone(input.body.phone);
	const email = normalizeEmail(input.body.officialEmail);

	const interests = await input.store.list(
		WORKFLOW_RENTAL_COLLECTIONS.INTERESTS,
		{ asset_id: input.assetId },
		{ orderBy: "created_at", direction: "desc", limit: 500 },
	);

	for (const interest of interests) {
		if (asString(interest.interested_user_id) === input.user.id) continue;

		if (phone && normalizePhone(interest.phone) === phone) {
			throw new DomainError(
				"DUPLICATE_PHONE_APPLICATION",
				"An application with this phone / WhatsApp number already exists for this asset.",
				409,
			);
		}

		if (email && normalizeEmail(interest.official_email) === email) {
			throw new DomainError(
				"DUPLICATE_EMAIL_APPLICATION",
				"An application with this email already exists for this asset.",
				409,
			);
		}
	}
}

function clientIp(request: Request): string | null {
	return (
		request.headers.get("CF-Connecting-IP") ||
		request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
		null
	);
}

function stringValue(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function recordValue(value: unknown): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) return null;
	return value as Record<string, unknown>;
}

function normalizePhone(value: unknown): string {
	const raw = typeof value === "string" || typeof value === "number" ? String(value) : "";
	return raw.replace(/[^\d+]/g, "").replace(/^00/, "+");
}

function normalizeEmail(value: unknown): string {
	return typeof value === "string" ? value.trim().toLowerCase() : "";
}