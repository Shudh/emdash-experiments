#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    full = ROOT / path
    full.parent.mkdir(parents=True, exist_ok=True)
    full.write_text(content, encoding="utf-8")
    print(f"patched {path}")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Could not find expected block for {label}. Stop and inspect manually.")
    return text.replace(old, new, 1)


def regex_replace_once(text: str, pattern: str, new: str, label: str, flags: int = 0) -> str:
    updated, count = re.subn(pattern, new, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"Could not find expected pattern for {label}. Stop and inspect manually.")
    return updated


FORM_GUARD_TS = r'''import { DomainError } from "../../domain/types.js";
import { verifyHumanCheckAnswer } from "./human-check.js";
import type { RuntimeEnv } from "./runtime-env.js";
import { turnstileSecretKeyFromEnv, verifyTurnstile } from "./turnstile.js";

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
		clientIp: clientIp(input.request),
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
		clientIp(input.request),
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

export function clientIp(request: Request): string | null {
	return (
		request.headers.get("CF-Connecting-IP") ||
		request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
		null
	);
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
'''

LEAD_GUARD_TS = r'''import type { DomainStore, UserContext } from "../../domain/types.js";
import { DomainError, asString } from "../../domain/types.js";
import { WORKFLOW_RENTAL_COLLECTIONS } from "../store/collections.js";
import type { RuntimeEnv } from "./runtime-env.js";
import {
	normalizeEmail,
	normalizePhone,
	validateSharedFormGuard,
} from "./form-guard.js";

export type ValidateLeadProtectionInput = {
	store: DomainStore;
	request: Request;
	user: UserContext;
	assetId: string;
	body: Record<string, unknown>;
	env?: RuntimeEnv;
};

export async function validateLeadProtection(input: ValidateLeadProtectionInput): Promise<void> {
	await validateSharedFormGuard({
		request: input.request,
		body: input.body,
		env: input.env,
		assetId: input.assetId,
		action: "lead_prescreen",
		requirePhone: true,
		requireHumanCheck: true,
		requireTurnstile: true,
	});

	await rejectDuplicateApplicantContact(input);
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
'''

TURNSTILE_TS = r'''import type { RuntimeEnv } from "./runtime-env.js";
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
'''

ASSET_DRAFT_TOKEN_TS = r'''import { DomainError } from "../../domain/types.js";
import type { Wf1Lane } from "../routing/lane.js";
import type { RuntimeEnv } from "./runtime-env.js";
import { envString } from "./runtime-env.js";

const TOKEN_VERSION = 1;
const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000;

export type AssetDraftTokenClaims = {
	v: number;
	purpose: "asset_create";
	lane: Wf1Lane;
	userId: string;
	draftId: string;
	issuedAt: number;
	expiresAt: number;
};

export type IssueAssetDraftTokenInput = {
	env?: RuntimeEnv;
	lane: Wf1Lane;
	userId: string;
	draftId: string;
	ttlMs?: number;
};

export type VerifyAssetDraftTokenInput = {
	env?: RuntimeEnv;
	token: string;
	lane: Wf1Lane;
	userId: string;
	draftId: string;
};

function signingSecretFromEnv(env: RuntimeEnv | undefined): string {
	const secret = envString(
		env,
		"HANDOVERNOW_ASSET_DRAFT_SIGNING_KEY",
		"WF1_ASSET_DRAFT_SIGNING_KEY",
		"HANDOVERNOW_FORM_GUARD_SIGNING_KEY",
		"HANDOVERNOW_TURNSTILE_SECRET_KEY",
		"TURNSTILE_SECRET_KEY",
		"CF_TURNSTILE_SECRET_KEY",
	);

	if (!secret) {
		throw new DomainError(
			"ASSET_DRAFT_SIGNING_NOT_CONFIGURED",
			"Asset draft signing key is not configured.",
			500,
		);
	}

	return secret;
}

function base64UrlEncode(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string): Uint8Array {
	const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
	const binary = atob(padded);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
	return bytes;
}

function textBytes(value: string): Uint8Array {
	return new TextEncoder().encode(value);
}

function jsonFromBytes(bytes: Uint8Array): unknown {
	return JSON.parse(new TextDecoder().decode(bytes));
}

async function signingKey(secret: string): Promise<CryptoKey> {
	return crypto.subtle.importKey(
		"raw",
		textBytes(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign", "verify"],
	);
}

async function signPayload(encodedPayload: string, secret: string): Promise<string> {
	const signature = await crypto.subtle.sign("HMAC", await signingKey(secret), textBytes(encodedPayload));
	return base64UrlEncode(new Uint8Array(signature));
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeClaims(value: unknown): AssetDraftTokenClaims | null {
	if (!isObjectRecord(value)) return null;

	if (value.v !== TOKEN_VERSION) return null;
	if (value.purpose !== "asset_create") return null;
	if (value.lane !== "test" && value.lane !== "public") return null;
	if (typeof value.userId !== "string" || value.userId.trim() === "") return null;
	if (typeof value.draftId !== "string" || value.draftId.trim() === "") return null;
	if (typeof value.issuedAt !== "number" || !Number.isFinite(value.issuedAt)) return null;
	if (typeof value.expiresAt !== "number" || !Number.isFinite(value.expiresAt)) return null;

	return value as AssetDraftTokenClaims;
}

export async function issueAssetDraftToken(input: IssueAssetDraftTokenInput): Promise<{ token: string; claims: AssetDraftTokenClaims }> {
	const now = Date.now();
	const claims: AssetDraftTokenClaims = {
		v: TOKEN_VERSION,
		purpose: "asset_create",
		lane: input.lane,
		userId: input.userId,
		draftId: input.draftId,
		issuedAt: now,
		expiresAt: now + (input.ttlMs ?? DEFAULT_TTL_MS),
	};

	const payload = base64UrlEncode(textBytes(JSON.stringify(claims)));
	const signature = await signPayload(payload, signingSecretFromEnv(input.env));

	return {
		token: `${payload}.${signature}`,
		claims,
	};
}

export async function verifyAssetDraftToken(input: VerifyAssetDraftTokenInput): Promise<AssetDraftTokenClaims> {
	const [payload, signature] = input.token.split(".");

	if (!payload || !signature) {
		throw new DomainError("ASSET_DRAFT_TOKEN_INVALID", "Asset draft token is invalid.", 403);
	}

	const expectedSignature = await signPayload(payload, signingSecretFromEnv(input.env));

	if (signature !== expectedSignature) {
		throw new DomainError("ASSET_DRAFT_TOKEN_INVALID", "Asset draft token is invalid.", 403);
	}

	const claims = normalizeClaims(jsonFromBytes(base64UrlDecode(payload)));

	if (claims === null) {
		throw new DomainError("ASSET_DRAFT_TOKEN_INVALID", "Asset draft token is invalid.", 403);
	}

	if (Date.now() > claims.expiresAt) {
		throw new DomainError("ASSET_DRAFT_TOKEN_EXPIRED", "Asset draft token expired. Please verify again.", 403);
	}

	if (claims.lane !== input.lane || claims.userId !== input.userId || claims.draftId !== input.draftId) {
		throw new DomainError("ASSET_DRAFT_TOKEN_MISMATCH", "Asset draft token does not match this request.", 403);
	}

	return claims;
}
'''

ASSET_CREATION_GUARD_TS = r'''import { DomainError, asString } from "../../domain/types.js";
import type { DomainStore, UserContext } from "../../domain/types.js";
import type { Wf1Lane } from "../routing/lane.js";
import { WORKFLOW_RENTAL_COLLECTIONS } from "../store/collections.js";
import type { RuntimeEnv } from "./runtime-env.js";
import { recordValue, stringValue, validateSharedFormGuard } from "./form-guard.js";
import { issueAssetDraftToken, verifyAssetDraftToken } from "./asset-draft-token.js";

const MAX_PENDING_REVIEW_ASSETS_PER_OWNER = 10;

export type IssueGuardedAssetDraftIntentInput = {
	request: Request;
	body: Record<string, unknown>;
	user: UserContext;
	lane: Wf1Lane;
	env?: RuntimeEnv;
};

export type AssetDraftTokenCheckInput = {
	env?: RuntimeEnv;
	user: UserContext;
	lane: Wf1Lane;
	draftId: string;
	assetDraftToken: string;
};

export async function issueGuardedAssetDraftIntent(input: IssueGuardedAssetDraftIntentInput) {
	const draftId = requiredString(input.body.draftId, "draftId");

	await validateSharedFormGuard({
		request: input.request,
		body: input.body,
		env: input.env,
		assetId: draftId,
		action: "asset_creation",
		requirePhone: false,
		requireHumanCheck: false,
		requireTurnstile: true,
	});

	const issued = await issueAssetDraftToken({
		env: input.env,
		lane: input.lane,
		userId: input.user.id,
		draftId,
	});

	return {
		draftId,
		assetDraftToken: issued.token,
		expiresAt: new Date(issued.claims.expiresAt).toISOString(),
	};
}

export async function assertAssetDraftTokenForUser(input: AssetDraftTokenCheckInput): Promise<void> {
	await verifyAssetDraftToken({
		env: input.env,
		token: input.assetDraftToken,
		lane: input.lane,
		userId: input.user.id,
		draftId: input.draftId,
	});
}

export async function assertOwnerPendingReviewQuota(store: DomainStore, user: UserContext): Promise<void> {
	const assets = await store.list(
		WORKFLOW_RENTAL_COLLECTIONS.ASSETS,
		{ owner_user_id: user.id },
		{ orderBy: "created_at", direction: "desc", limit: 200 },
	);

	let pending = 0;
	for (const asset of assets) {
		const events = await store.list(
			WORKFLOW_RENTAL_COLLECTIONS.ASSET_EVENTS,
			{ asset_id: asset.id },
			{ orderBy: "created_at", direction: "desc", limit: 10 },
		);
		const latestReviewEvent = events.find((event) => {
			const kind = asString(event.event_kind);
			return kind === "marketplace_review_requested" || kind === "marketplace_review_rejected" || kind === "asset_published";
		});
		if (asString(latestReviewEvent?.event_kind) === "marketplace_review_requested") pending += 1;
	}

	if (pending >= MAX_PENDING_REVIEW_ASSETS_PER_OWNER) {
		throw new DomainError(
			"PENDING_REVIEW_QUOTA_EXCEEDED",
			"You already have too many assets waiting for marketplace review.",
			429,
		);
	}
}

export function assertAssetCreationBodyGuarded(input: {
	body: Record<string, unknown>;
	lane: Wf1Lane;
}): { draftId: string; assetDraftToken: string; configSpec: Record<string, unknown>; primaryMediaRef: Record<string, unknown> } {
	const draftId = requiredString(input.body.draftId, "draftId");
	const assetDraftToken = requiredString(input.body.assetDraftToken, "assetDraftToken");
	const configSpec = recordValue(input.body.configSpec) ?? {};
	const primaryMediaRef = primaryMediaRefFromBody(input.body, configSpec);

	assertPrimaryImageMediaRef(primaryMediaRef);

	return { draftId, assetDraftToken, configSpec, primaryMediaRef };
}

export async function assertMarketplaceReviewAssetReady(store: DomainStore, user: UserContext, assetId: string): Promise<void> {
	const asset = await store.get(WORKFLOW_RENTAL_COLLECTIONS.ASSETS, assetId);
	if (!asset) {
		throw new DomainError("ASSET_NOT_FOUND", "Asset not found", 404);
	}

	if (asString(asset.owner_user_id) !== user.id) {
		throw new DomainError("FORBIDDEN", "Only the asset owner can request marketplace review", 403);
	}

	const configSpec = recordValue(asset.config_spec) ?? {};
	const media = primaryMediaRefFromBody({}, configSpec);
	assertPrimaryImageMediaRef(media);
	await assertOwnerPendingReviewQuota(store, user);
}

function primaryMediaRefFromBody(body: Record<string, unknown>, configSpec: Record<string, unknown>): Record<string, unknown> {
	const direct = recordValue(body.primaryMediaRef);
	if (direct) return direct;

	const thumbnail = recordValue(configSpec.thumbnailMediaRef);
	if (thumbnail) return thumbnail;

	const mediaRefs = Array.isArray(configSpec.mediaRefs) ? configSpec.mediaRefs : [];
	for (const mediaRef of mediaRefs) {
		const record = recordValue(mediaRef);
		if (record) return record;
	}

	throw new DomainError(
		"PRIMARY_IMAGE_REQUIRED",
		"A primary property image is required before creating or reviewing an asset.",
		422,
	);
}

function assertPrimaryImageMediaRef(mediaRef: Record<string, unknown>): void {
	const url = stringValue(mediaRef.url);
	const storageKey = stringValue(mediaRef.storageKey);
	const mimeType = stringValue(mediaRef.mimeType).toLowerCase();

	if (!url && !storageKey) {
		throw new DomainError(
			"PRIMARY_IMAGE_REQUIRED",
			"A primary property image is required before creating or reviewing an asset.",
			422,
		);
	}

	if (!mimeType.startsWith("image/")) {
		throw new DomainError(
			"PRIMARY_IMAGE_MUST_BE_IMAGE",
			"The primary property media must be an image.",
			422,
		);
	}
}

function requiredString(value: unknown, label: string): string {
	const text = stringValue(value);
	if (!text) {
		throw new DomainError("INVALID_ASSET_CREATE_REQUEST", `${label} is required`, 400);
	}
	return text;
}
'''


def write_new_files() -> None:
    write("src/lib/wf1/security/form-guard.ts", FORM_GUARD_TS)
    write("src/lib/wf1/security/lead-guard.ts", LEAD_GUARD_TS)
    write("src/lib/wf1/security/turnstile.ts", TURNSTILE_TS)
    write("src/lib/wf1/security/asset-draft-token.ts", ASSET_DRAFT_TOKEN_TS)
    write("src/lib/wf1/security/asset-creation-guard.ts", ASSET_CREATION_GUARD_TS)


def patch_upload_types() -> None:
    path = "src/lib/wf1/uploads/types.ts"
    text = read(path)
    if "assetDraftToken?: string;" not in text:
        text = replace_once(text, "\tdraftId?: string;\n", "\tdraftId?: string;\n\tassetDraftToken?: string;\n", "upload form input assetDraftToken")
        write(path, text)
    else:
        print(f"already patched {path}")


def patch_upload_policy() -> None:
    path = "src/lib/wf1/uploads/upload-policy.ts"
    text = read(path)
    if "assetDraftToken: optional(\"assetDraftToken\")" not in text:
        text = replace_once(
            text,
            "\t\tdraftId: optional(\"draftId\"),\n",
            "\t\tdraftId: optional(\"draftId\"),\n\t\tassetDraftToken: optional(\"assetDraftToken\"),\n",
            "parse upload assetDraftToken",
        )
        write(path, text)
    else:
        print(f"already patched {path}")


def patch_upload_route() -> None:
    path = "src/lib/wf1/api/upload-route.ts"
    text = read(path)
    if "assertAssetDraftTokenForUser" not in text:
        text = replace_once(
            text,
            'import type { Wf1Lane } from "../routing/lane.js";\n',
            'import type { Wf1Lane } from "../routing/lane.js";\nimport { assertAssetDraftTokenForUser } from "../security/asset-creation-guard.js";\nimport type { RuntimeEnv } from "../security/runtime-env.js";\n',
            "upload route imports",
        )
        text = replace_once(
            text,
            "\temdash: Wf1EmDashMediaRuntime | null | undefined;\n",
            "\temdash: Wf1EmDashMediaRuntime | null | undefined;\n\tenv?: RuntimeEnv;\n",
            "upload route input env",
        )
        text = replace_once(
            text,
            "\tconst formInput = parseWf1UploadFormInput(formData);\n\tconst authorization = defineStoreOnAuthorization(\n",
            "\tconst formInput = parseWf1UploadFormInput(formData);\n\n\tif (formInput.purpose === \"asset_draft_media\") {\n\t\tawait assertAssetDraftTokenForUser({\n\t\t\tenv: input.env,\n\t\t\tuser: input.user,\n\t\t\tlane: input.lane,\n\t\t\tdraftId: formInput.draftId ?? \"\",\n\t\t\tassetDraftToken: formInput.assetDraftToken ?? \"\",\n\t\t});\n\t}\n\n\tconst authorization = defineStoreOnAuthorization(\n",
            "upload route asset draft token check",
        )
        write(path, text)
    else:
        print(f"already patched {path}")


def patch_handler() -> None:
    path = "src/lib/wf1/api/handler.ts"
    text = read(path)
    if "issueGuardedAssetDraftIntent" not in text:
        text = replace_once(
            text,
            'import { validateLeadProtection } from "../security/lead-guard.js";\n',
            'import {\n\tassertAssetCreationBodyGuarded,\n\tassertAssetDraftTokenForUser,\n\tassertMarketplaceReviewAssetReady,\n\tissueGuardedAssetDraftIntent,\n} from "../security/asset-creation-guard.js";\nimport { validateLeadProtection } from "../security/lead-guard.js";\n',
            "handler asset creation guard imports",
        )
        text = replace_once(
            text,
            "\t\tif (input.request.method === \"POST\" && input.path === \"uploads\") {\n\t\t\treturn jsonOk(\n\t\t\t\tawait handleWf1UploadRoute({\n\t\t\t\t\trequest: input.request,\n\t\t\t\t\tstore: input.store,\n\t\t\t\t\tuser,\n\t\t\t\t\tlane,\n\t\t\t\t\temdash: input.emdash,\n\t\t\t\t}),\n\t\t\t\t201,\n\t\t\t);\n\t\t}\n",
            "\t\tif (input.request.method === \"POST\" && input.path === \"uploads\") {\n\t\t\treturn jsonOk(\n\t\t\t\tawait handleWf1UploadRoute({\n\t\t\t\t\trequest: input.request,\n\t\t\t\t\tstore: input.store,\n\t\t\t\t\tuser,\n\t\t\t\t\tlane,\n\t\t\t\t\temdash: input.emdash,\n\t\t\t\t\tenv: input.env,\n\t\t\t\t}),\n\t\t\t\t201,\n\t\t\t);\n\t\t}\n",
            "handler pass env to upload route",
        )
        text = replace_once(
            text,
            "\t\tif (input.request.method === \"POST\" && input.path === \"owner/assets/add\") {\n\t\t\treturn jsonOk(\n\t\t\t\tawait createWorkflowAsset(input.store, user, {\n\t\t\t\t\tassetKind: stringField(body, \"assetKind\"),\n\t\t\t\t\ttitle: stringField(body, \"title\"),\n\t\t\t\t\tlocationLabel: asOptionalString(body.locationLabel),\n\t\t\t\t\tpublicPrice: optionalNumber(body, \"publicPrice\"),\n\t\t\t\t\tcurrency: asOptionalString(body.currency) ?? \"INR\",\n\t\t\t\t\townerConditionsSpec: optionalRecord(body, \"ownerConditionsSpec\"),\n\t\t\t\t\tconfigSpec: lane === \"test\" ? withTestLaneConfigSpec({}, user) : undefined,\n\t\t\t\t}),\n\t\t\t\t201,\n\t\t\t);\n\t\t}\n",
            "\t\tif (input.request.method === \"POST\" && input.path === \"owner/assets/draft-intent\") {\n\t\t\treturn jsonOk(\n\t\t\t\tawait issueGuardedAssetDraftIntent({\n\t\t\t\t\trequest: input.request,\n\t\t\t\t\tbody,\n\t\t\t\t\tuser,\n\t\t\t\t\tlane,\n\t\t\t\t\tenv: input.env,\n\t\t\t\t}),\n\t\t\t\t201,\n\t\t\t);\n\t\t}\n\n\t\tif (input.request.method === \"POST\" && input.path === \"owner/assets/add\") {\n\t\t\tconst assetCreateGuard = assertAssetCreationBodyGuarded({ body, lane });\n\n\t\t\tawait assertAssetDraftTokenForUser({\n\t\t\t\tenv: input.env,\n\t\t\t\tuser,\n\t\t\t\tlane,\n\t\t\t\tdraftId: assetCreateGuard.draftId,\n\t\t\t\tassetDraftToken: assetCreateGuard.assetDraftToken,\n\t\t\t});\n\n\t\t\treturn jsonOk(\n\t\t\t\tawait createWorkflowAsset(input.store, user, {\n\t\t\t\t\tassetKind: stringField(body, \"assetKind\"),\n\t\t\t\t\ttitle: stringField(body, \"title\"),\n\t\t\t\t\tlocationLabel: asOptionalString(body.locationLabel),\n\t\t\t\t\tpublicPrice: optionalNumber(body, \"publicPrice\"),\n\t\t\t\t\tcurrency: asOptionalString(body.currency) ?? \"INR\",\n\t\t\t\t\townerConditionsSpec: optionalRecord(body, \"ownerConditionsSpec\"),\n\t\t\t\t\tconfigSpec: lane === \"test\" ? withTestLaneConfigSpec(assetCreateGuard.configSpec, user) : assetCreateGuard.configSpec,\n\t\t\t\t}),\n\t\t\t\t201,\n\t\t\t);\n\t\t}\n",
            "handler draft intent and guarded asset create",
        )
        text = replace_once(
            text,
            "\t\t\tif (parts[3] === \"request-marketplace-review\") {\n\t\t\t\treturn jsonOk(\n\t\t\t\t\tawait requestMarketplaceReview(input.store, user, parts[2], {\n",
            "\t\t\tif (parts[3] === \"request-marketplace-review\") {\n\t\t\t\tawait assertMarketplaceReviewAssetReady(input.store, user, parts[2]);\n\n\t\t\t\treturn jsonOk(\n\t\t\t\t\tawait requestMarketplaceReview(input.store, user, parts[2], {\n",
            "handler review image readiness",
        )
        write(path, text)
    else:
        print(f"already patched {path}")


def patch_media_upload_component() -> None:
    for path in ["src/components/wf1-test/Wf1MediaUpload.astro", "src/components/wf1/Wf1MediaUpload.astro"]:
        text = read(path)

        if "assetDraftToken" in text:
            print(f"already patched {path}")
            continue

        # This component does not need a new Astro prop for assetDraftToken.
        # Asset creation stores the server-issued token in the nearest owner form,
        # and the upload component reads that hidden input just before multipart upload.
        # Keep the patch focused on the upload payload so existing component props stay stable.
        text = replace_once(
            text,
            "\t\tappendIfPresent(body, \"documentKind\", root.dataset.documentKind);\n",
            "\t\tappendIfPresent(body, \"documentKind\", root.dataset.documentKind);\n\n\t\tconst ownerForm = root.closest(\"form\");\n\t\tconst assetDraftToken = ownerForm?.querySelector<HTMLInputElement>(\"[name='assetDraftToken']\")?.value;\n\t\tappendIfPresent(body, \"assetDraftToken\", assetDraftToken);\n",
            f"{path} append assetDraftToken",
        )
        write(path, text)


def patch_owner_asset_page() -> None:
    path = "src/pages/test-corridor/wf1/owner/assets/new.astro"
    text = read(path)
    if "data-hn-asset-draft-guard-v1" in text:
        print(f"already patched {path}")
        return

    if 'publicTurnstileSiteKeyFromEnv' not in text:
        text = replace_once(
            text,
            'import Wf1TestLaneBanner from "../../../../../components/wf1-test/Wf1TestLaneBanner.astro";\n',
            'import Wf1TestLaneBanner from "../../../../../components/wf1-test/Wf1TestLaneBanner.astro";\nimport { getRuntimeEnvFromLocals } from "../../../../../lib/wf1/security/runtime-env.js";\nimport { publicTurnstileSiteKeyFromEnv } from "../../../../../lib/wf1/security/turnstile.js";\n',
            "owner create turnstile imports",
        )
    text = replace_once(
        text,
        "const assetDraftId = crypto.randomUUID();\nconst wf1UploadUrl = \"/test-corridor/api/wf1-rental/uploads\";\n---",
        "const assetDraftId = crypto.randomUUID();\nconst wf1UploadUrl = \"/test-corridor/api/wf1-rental/uploads\";\nconst runtimeEnv = getRuntimeEnvFromLocals(Astro.locals);\nconst turnstileSiteKey = publicTurnstileSiteKeyFromEnv(runtimeEnv) ?? \"\";\nconst formStartedAt = new Date().toISOString();\n---",
        "owner create runtime env constants",
    )
    text = replace_once(
        text,
        '<form class="rental-panel create-form" id="asset-form" data-asset-draft-id={assetDraftId} data-wf1-upload-url={wf1UploadUrl}>',
        '<form class="rental-panel create-form" id="asset-form" data-asset-draft-id={assetDraftId} data-wf1-upload-url={wf1UploadUrl} data-turnstile-site-key={turnstileSiteKey} data-form-started-at={formStartedAt}>\n\t\t\t\t<input type="hidden" name="assetDraftToken" value="" data-asset-draft-token />\n\t\t\t\t<input type="hidden" name="draftId" value={assetDraftId} />\n\t\t\t\t<input type="hidden" name="formStartedAt" value={formStartedAt} />\n\t\t\t\t<input class="hn-hidden-trap-input" type="text" name="companyWebsite" autocomplete="off" tabindex="-1" aria-hidden="true" />\n\t\t\t\t<div class="asset-draft-guard" data-hn-asset-draft-guard-v1>\n\t\t\t\t\t<p class="rental-muted" data-asset-draft-guard-status>Your typed listing is saved in this browser. Verification unlocks photo upload and review submission.</p>\n\t\t\t\t\t<div data-asset-draft-turnstile data-site-key={turnstileSiteKey}></div>\n\t\t\t\t</div>',
        "owner create hidden guard fields",
    )
    text = text.replace('label="Primary property image or PDF"', 'label="Primary property image"')
    text = text.replace('required={false}\n\t\t\t\t\t\tuploadUrl={wf1UploadUrl}', 'required={true}\n\t\t\t\t\t\taccept="image/*"\n\t\t\t\t\t\tuploadUrl={wf1UploadUrl}')
    text = replace_once(
        text,
        "\t\tconst response = await fetch(wf1UploadUrl, {\n",
        "\t\tconst assetDraftToken = form?.querySelector<HTMLInputElement>(\"[name='assetDraftToken']\")?.value ?? \"\";\n\n\t\tif (!assetDraftToken) {\n\t\t\tthrow new Error(\"Complete verification before uploading asset media.\");\n\t\t}\n\n\t\tbody.append(\"assetDraftToken\", assetDraftToken);\n\n\t\tconst response = await fetch(wf1UploadUrl, {\n",
        "owner create custom inventory upload token",
    )
    text = replace_once(
        text,
        "\t\tconst payload = await response.json().catch(() => ({}));\n\n\t\tif (!response.ok) {\n",
        "\t\tconst payload = await response.json().catch(() => ({}));\n\n\t\tif (response.status === 401 || response.status === 403) {\n\t\t\tsaveCreateAssetDraft();\n\t\t}\n\n\t\tif (!response.ok) {\n",
        "owner create custom upload save draft on auth fail",
    )
    text = replace_once(
        text,
        "\t\t\tconst assetMediaRef = mediaRefFromHidden(\"assetMedia\", \"asset_thumbnail\", \"asset\");\n\n\t\t\tconst addData = await postJson(\"/test-corridor/api/wf1-rental/owner/assets/add\", {\n",
        "\t\t\tconst assetMediaRef = mediaRefFromHidden(\"assetMedia\", \"asset_thumbnail\", \"asset\");\n\t\t\tconst assetDraftToken = form.querySelector<HTMLInputElement>(\"[name='assetDraftToken']\")?.value ?? \"\";\n\n\t\t\tif (!assetDraftToken) {\n\t\t\t\tthrow new Error(\"Complete verification before sending this asset for review.\");\n\t\t\t}\n\n\t\t\tif (!assetMediaRef || !assetMediaRef.mimeType.startsWith(\"image/\")) {\n\t\t\t\tthrow new Error(\"Upload one primary property image before creating this asset.\");\n\t\t\t}\n\n\t\t\tconst addData = await postJson(\"/test-corridor/api/wf1-rental/owner/assets/add\", {\n\t\t\t\tdraftId: assetDraftId,\n\t\t\t\tassetDraftToken,\n\t\t\t\tprimaryMediaRef: assetMediaRef,\n",
        "owner create guarded add payload",
    )
    text = replace_once(
        text,
        "\t\t\t\tcurrency: \"INR\",\n\t\t\t\townerConditionsSpec,\n\t\t\t});\n",
        "\t\t\t\tcurrency: \"INR\",\n\t\t\t\townerConditionsSpec,\n\t\t\t\tconfigSpec: {\n\t\t\t\t\tbedrooms: Number(data.get(\"bedrooms\")),\n\t\t\t\t\tfurnishing: data.get(\"furnishing\"),\n\t\t\t\t\tthumbnailMediaRef: assetMediaRef,\n\t\t\t\t\tmediaRefs: [assetMediaRef],\n\t\t\t\t\tdraftId: assetDraftId,\n\t\t\t\t},\n\t\t\t});\n",
        "owner create add config spec",
    )

    # Add guard script after variable declarations in module script.
    guard_code = r'''
	const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
	const CREATE_DRAFT_KEY = "hn:wf1:test:create-asset:draft:v3";

	type BrowserWindowWithTurnstile = Window & {
		turnstile?: {
			render: (element: HTMLElement, options: Record<string, unknown>) => string;
		};
	};

	function browserTurnstile() {
		return (window as BrowserWindowWithTurnstile).turnstile;
	}

	function createAssetControls() {
		return {
			fileInputs: [...document.querySelectorAll<HTMLInputElement>("#asset-form input[type='file']")],
			submitButton: document.querySelector<HTMLButtonElement>("#asset-form button[type='submit']"),
			status: document.querySelector<HTMLElement>("[data-asset-draft-guard-status]"),
			turnstileSlot: document.querySelector<HTMLElement>("[data-asset-draft-turnstile]"),
			tokenInput: document.querySelector<HTMLInputElement>("[data-asset-draft-token]"),
		};
	}

	function userIsLoggedIn() {
		const bodyText = document.body.textContent || "";
		return bodyText.includes("Logout") || /Welcome\s+[^\s@]+@[^\s@]+/.test(bodyText);
	}

	function saveCreateAssetDraft() {
		if (!form) return;
		const fields: Record<string, unknown> = {};
		for (const control of form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select")) {
			if (!control.name && !control.id) continue;
			if (control instanceof HTMLInputElement && control.type === "file") continue;
			if (control instanceof HTMLInputElement && control.type === "password") continue;
			const key = control.name || control.id;
			if (control instanceof HTMLInputElement && (control.type === "checkbox" || control.type === "radio")) {
				fields[key] = { checked: control.checked, value: control.value };
			} else {
				fields[key] = { value: control.value };
			}
		}
		try { sessionStorage.setItem(CREATE_DRAFT_KEY, JSON.stringify({ savedAt: Date.now(), fields })); } catch {}
	}

	function restoreCreateAssetDraft() {
		if (!form) return;
		let parsed: { fields?: Record<string, { value?: string; checked?: boolean }> } | null = null;
		try { parsed = JSON.parse(sessionStorage.getItem(CREATE_DRAFT_KEY) || "null"); } catch {}
		if (!parsed?.fields) return;
		for (const control of form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select")) {
			const key = control.name || control.id;
			const saved = parsed.fields[key];
			if (!saved) continue;
			if (control instanceof HTMLInputElement && (control.type === "checkbox" || control.type === "radio")) {
				control.checked = Boolean(saved.checked);
			} else if (typeof saved.value === "string" && control.value === "") {
				control.value = saved.value;
			}
		}
	}

	function safeLoginUrl() {
		return `/login?redirect=${encodeURIComponent(location.pathname + location.search)}`;
	}

	function setAssetCreateLocked(locked: boolean, message: string) {
		const controls = createAssetControls();
		for (const fileInput of controls.fileInputs) fileInput.disabled = locked;
		if (controls.submitButton) {
			controls.submitButton.disabled = locked;
			controls.submitButton.hidden = locked;
		}
		if (controls.status) controls.status.textContent = message;
	}

	function ensureLoggedInForCreate(event?: Event) {
		if (userIsLoggedIn()) return true;
		if (event) event.preventDefault();
		saveCreateAssetDraft();
		setAssetCreateLocked(true, "Your listing is saved in this browser. Continue securely to add photos and request review.");
		setTimeout(() => { location.href = safeLoginUrl(); }, 120);
		return false;
	}

	async function loadTurnstileScript() {
		if (browserTurnstile()) return;
		const existing = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SCRIPT_URL}"]`);
		if (existing) {
			await new Promise<void>((resolve, reject) => {
				existing.addEventListener("load", () => resolve(), { once: true });
				existing.addEventListener("error", () => reject(new Error("Turnstile failed to load.")), { once: true });
			});
			return;
		}
		await new Promise<void>((resolve, reject) => {
			const script = document.createElement("script");
			script.src = TURNSTILE_SCRIPT_URL;
			script.async = true;
			script.addEventListener("load", () => resolve(), { once: true });
			script.addEventListener("error", () => reject(new Error("Turnstile failed to load.")), { once: true });
			document.head.appendChild(script);
		});
	}

	async function issueAssetDraftIntent(turnstileToken: string) {
		if (!form) throw new Error("Asset form is missing.");
		const payload = {
			draftId: assetDraftId,
			turnstileToken,
			formStartedAt: form.dataset.formStartedAt || new Date().toISOString(),
			companyWebsite: (form.querySelector<HTMLInputElement>("[name='companyWebsite']")?.value ?? ""),
		};
		const response = await fetch("/test-corridor/api/wf1-rental/owner/assets/draft-intent", {
			method: "POST",
			credentials: "same-origin",
			headers: { "Content-Type": "application/json", "X-EmDash-Request": "1" },
			body: JSON.stringify(payload),
		});
		const data = await response.json().catch(() => ({}));
		if (!response.ok) throw new Error(data?.error?.message ?? "Verification failed.");
		return String((data?.data ?? data)?.assetDraftToken ?? "");
	}

	async function initAssetCreateGuard() {
		restoreCreateAssetDraft();
		if (!form) return;
		form.addEventListener("input", saveCreateAssetDraft, { passive: true });
		form.addEventListener("change", saveCreateAssetDraft, { passive: true });
		for (const fileInput of form.querySelectorAll<HTMLInputElement>("input[type='file']")) {
			fileInput.addEventListener("click", (event) => { ensureLoggedInForCreate(event); });
		}
		form.addEventListener("submit", (event) => { if (!ensureLoggedInForCreate(event)) return; });
		if (!userIsLoggedIn()) {
			setAssetCreateLocked(true, "Fill the listing now. Your data is safe in this browser; continue securely only when adding photos or sending for review.");
			return;
		}

		const controls = createAssetControls();
		const siteKey = form.dataset.turnstileSiteKey || controls.turnstileSlot?.dataset.siteKey || "";
		if (!siteKey || !controls.turnstileSlot || !controls.tokenInput) {
			setAssetCreateLocked(true, "Verification is not configured. Ask admin to configure Turnstile before asset creation.");
			return;
		}
		setAssetCreateLocked(true, "Complete verification to unlock photo upload and review submission.");
		try {
			await loadTurnstileScript();
			const api = browserTurnstile();
			if (!api) throw new Error("Turnstile API is unavailable.");
			api.render(controls.turnstileSlot, {
				sitekey: siteKey,
				appearance: "interaction-only",
				callback: async (token: unknown) => {
					try {
						const assetDraftToken = await issueAssetDraftIntent(String(token));
						controls.tokenInput!.value = assetDraftToken;
						setAssetCreateLocked(false, "Verified. You can now upload one primary image and request marketplace review.");
					} catch (error) {
						controls.tokenInput!.value = "";
						setAssetCreateLocked(true, error instanceof Error ? error.message : "Verification failed.");
					}
				},
				"expired-callback": () => {
					controls.tokenInput!.value = "";
					setAssetCreateLocked(true, "Verification expired. Please verify again.");
				},
				"error-callback": () => {
					controls.tokenInput!.value = "";
					setAssetCreateLocked(true, "Verification failed. Please retry.");
				},
			});
		} catch (error) {
			setAssetCreateLocked(true, error instanceof Error ? error.message : "Verification could not load.");
		}
	}

	void initAssetCreateGuard();
'''
    insertion = "\tconst wf1UploadUrl = form?.dataset.wf1UploadUrl ?? \"/test-corridor/api/wf1-rental/uploads\";\n"
    text = replace_once(text, insertion, insertion + guard_code, "owner create TS guard insertion")
    write(path, text)


def patch_marketplace_asset_page() -> None:
    path = "src/pages/test-corridor/wf1/marketplace/assets/[id].astro"
    text = read(path)
    if "data-express-can-submit" not in text:
        text = replace_once(
            text,
            'class="express-interest-form"\n\t\t\t\t\t\t\t\t\t\t\tdata-express-interest-form\n',
            'class="express-interest-form"\n\t\t\t\t\t\t\t\t\t\t\tdata-express-interest-form\n\t\t\t\t\t\t\t\t\t\t\tdata-express-can-submit={canExpressInterest ? "true" : "false"}\n\t\t\t\t\t\t\t\t\t\t\tdata-login-href={loginHref}\n',
            "marketplace form data attrs",
        )
        text = text.replace('Login required', 'Continue when ready')
        text = text.replace('Login to express interest, or chat with the HandoverNow agent and continue after login.', 'You can answer screening questions now. Your answers are saved in this browser; continue securely only when submitting.')
        text = text.replace('Login or register', 'Continue securely')
        # Render normal form for anonymous users instead of login panel by widening conditional.
        text = text.replace('{canExpressInterest ? (', '{canExpressInterest || relationship === "anonymous" ? (', 1)
        # Turnstile widget on normal form only for logged-in canSubmit.
        text = text.replace('{turnstileSiteKey !== "" ? (', '{turnstileSiteKey !== "" && canExpressInterest ? (', 1)
        text = replace_once(
            text,
            '<button class="rental-button" type="submit" data-express-interest-submit>\n\t\t\t\t\t\t\t\t\t\t\t\t\tExpress interest\n\t\t\t\t\t\t\t\t\t\t\t\t</button>',
            '<button class="rental-button" type="submit" data-express-interest-submit>\n\t\t\t\t\t\t\t\t\t\t\t\t\t{canExpressInterest ? "Express interest" : "Continue securely"}\n\t\t\t\t\t\t\t\t\t\t\t\t</button>',
            "marketplace form submit copy",
        )
    if "EXPRESS_DRAFT_KEY" not in text:
        text = replace_once(
            text,
            '\t\tconst MIN_PRESCREEN_SECONDS = 8;\n',
            '\t\tconst MIN_PRESCREEN_SECONDS = 8;\n\t\tconst EXPRESS_DRAFT_KEY = "hn:wf1:test:express-interest:normal:v1";\n',
            "normal form draft key",
        )
        text = replace_once(
            text,
            '\t\tfunction initExpressInterestForm() {\n\t\t\tconst form = document.querySelector("[data-express-interest-form]");\n',
            r'''		function saveNormalExpressDraft(form) {
			const fields = {};
			for (const control of form.querySelectorAll("input, textarea, select")) {
				const key = control.name || control.id;
				if (!key) continue;
				if (control.type === "password") continue;
				if (control.type === "checkbox" || control.type === "radio") {
					fields[key] = { checked: Boolean(control.checked), value: control.value };
				} else {
					fields[key] = { value: control.value };
				}
			}
			try { sessionStorage.setItem(EXPRESS_DRAFT_KEY, JSON.stringify({ savedAt: Date.now(), fields })); } catch {}
		}

		function restoreNormalExpressDraft(form) {
			let parsed = null;
			try { parsed = JSON.parse(sessionStorage.getItem(EXPRESS_DRAFT_KEY) || "null"); } catch {}
			if (!parsed || !parsed.fields) return;
			for (const control of form.querySelectorAll("input, textarea, select")) {
				const key = control.name || control.id;
				const saved = parsed.fields[key];
				if (!saved) continue;
				if (control.type === "checkbox" || control.type === "radio") {
					control.checked = Boolean(saved.checked);
				} else if (typeof saved.value === "string" && !control.value) {
					control.value = saved.value;
				}
			}
		}

		function initExpressInterestForm() {
			const form = document.querySelector("[data-express-interest-form]");
''',
            "normal form draft helpers",
        )
        text = replace_once(
            text,
            '\t\t\tconst status = form.querySelector("[data-express-interest-status]");\n\t\t\tconst submit = form.querySelector("[data-express-interest-submit]");\n',
            '\t\t\tconst status = form.querySelector("[data-express-interest-status]");\n\t\t\tconst submit = form.querySelector("[data-express-interest-submit]");\n\t\t\tconst canSubmit = form.dataset.expressCanSubmit === "true";\n\t\t\trestoreNormalExpressDraft(form);\n\t\t\tform.addEventListener("input", function () { saveNormalExpressDraft(form); }, { passive: true });\n\t\t\tform.addEventListener("change", function () { saveNormalExpressDraft(form); }, { passive: true });\n',
            "normal form init draft",
        )
        text = replace_once(
            text,
            '\t\t\t\tif (status instanceof HTMLElement) {\n\t\t\t\t\tstatus.removeAttribute("data-state");\n\t\t\t\t\tstatus.textContent = "";\n\t\t\t\t}\n',
            '\t\t\t\tif (status instanceof HTMLElement) {\n\t\t\t\t\tstatus.removeAttribute("data-state");\n\t\t\t\t\tstatus.textContent = "";\n\t\t\t\t}\n\n\t\t\t\tif (!canSubmit) {\n\t\t\t\t\tsaveNormalExpressDraft(form);\n\t\t\t\t\tif (status instanceof HTMLElement) status.textContent = "Your answers are saved. Continuing securely...";\n\t\t\t\t\tlocation.href = form.dataset.loginHref || "/login";\n\t\t\t\t\treturn;\n\t\t\t\t}\n',
            "normal form login redirect",
        )
        text = replace_once(
            text,
            '\t\t\tconst status = document.querySelector("[data-express-turnstile-status]");\n',
            '\t\t\tconst status = document.querySelector("[data-express-turnstile-status]");\n\t\t\tconst submit = document.querySelector("[data-express-interest-submit]");\n\n\t\t\tfunction setSubmitReady(ready, message) {\n\t\t\t\tif (submit instanceof HTMLButtonElement) {\n\t\t\t\t\tsubmit.disabled = !ready;\n\t\t\t\t\tsubmit.hidden = !ready;\n\t\t\t\t}\n\t\t\t\tif (status instanceof HTMLElement && message) status.textContent = message;\n\t\t\t}\n',
            "normal form turnstile submit control helper",
        )
        text = replace_once(
            text,
            '\t\t\tif (!(turnstileSlot instanceof HTMLElement)) {\n\t\t\t\treturn;\n\t\t\t}\n',
            '\t\t\tif (!(turnstileSlot instanceof HTMLElement)) {\n\t\t\t\treturn;\n\t\t\t}\n\n\t\t\tsetSubmitReady(false, "Complete verification to continue.");\n',
            "normal form turnstile initial lock",
        )
        text = text.replace('status.textContent = "Spam verification complete.";', 'setSubmitReady(true, "Spam verification complete.");', 1)
        text = text.replace('status.textContent = "Spam verification expired. Please verify again.";', 'setSubmitReady(false, "Spam verification expired. Please verify again.");', 1)
        text = text.replace('status.textContent = "Spam verification failed. Please retry.";', 'setSubmitReady(false, "Spam verification failed. Please retry.");', 1)
    write(path, text)


def patch_chatbotify_components() -> None:
    path = "src/features/wf1-chatbotify/PrescreenConversationCard.tsx"
    text = read(path)
    if "finalSubmitReady" not in text:
        text = replace_once(
            text,
            "\tconst showTurnstile = phase === \"final_check\" && config.turnstileSiteKey !== \"\" && config.canSubmit;\n",
            "\tconst showTurnstile = phase === \"final_check\" && config.turnstileSiteKey !== \"\" && config.canSubmit;\n\tconst finalSubmitReady = !turnstileTokenIsRequired(config) || turnstileTokenIsPresent(state);\n",
            "chat final submit ready",
        )
        text = replace_once(
            text,
            '<button className="hn-chatbotify-button" type="button" disabled={submitState.busy} onClick={submitApplication}>\n\t\t\t\t\t\t\t{submitState.busy ? "Submitting..." : config.canSubmit ? "Submit application" : "Login and submit"}\n\t\t\t\t\t\t</button>',
            '{config.canSubmit && !finalSubmitReady ? (\n\t\t\t\t\t\t\t<span className="hn-chatbotify-muted">Complete verification to submit.</span>\n\t\t\t\t\t\t) : (\n\t\t\t\t\t\t\t<button className="hn-chatbotify-button" type="button" disabled={submitState.busy} onClick={submitApplication}>\n\t\t\t\t\t\t\t\t{submitState.busy ? "Submitting..." : config.canSubmit ? "Submit application" : "Continue securely"}\n\t\t\t\t\t\t\t</button>\n\t\t\t\t\t\t)}',
            "chat final submit hidden until turnstile",
        )
        write(path, text)
    else:
        print(f"already patched {path}")


def apply_form_guard_contract() -> None:
    write_new_files()
    patch_upload_types()
    patch_upload_policy()
    patch_upload_route()
    patch_handler()
    patch_media_upload_component()
    patch_owner_asset_page()
    patch_marketplace_asset_page()
    patch_chatbotify_components()
    print("WF1 shared form guard / Turnstile contract drop-in complete.")


# --- WF1 rate-limit patch: copied from EmDash core DB-backed limiter pattern ---
WF1_RATE_LIMIT_TS = '''import { sql, type Kysely } from "kysely";
import { getDb } from "emdash/runtime";

import { DomainError } from "../../domain/types.js";

/**
 * WF1 request rate limiting.
 *
 * This intentionally mirrors EmDash core's DB-backed auth rate limiter
 * from packages/core/src/auth/rate-limit.ts instead of requiring paid
 * Cloudflare WAF rules for the first production guard.
 *
 * Shared table:
 *   _emdash_rate_limits(key, window, count)
 *
 * Key format:
 *   {ip}:{wf1 endpoint family}
 *
 * Window format:
 *   ISO timestamp truncated to the window size.
 */

type AnyDb = Record<string, unknown>;

const IP_PATTERN = /^[\\da-fA-F.:]+$/;

export type Wf1RateLimitResult = {
\tallowed: boolean;
\tcount: number;
\tlimit: number;
};

type Wf1RateLimitRule = {
\tendpoint: string;
\tmaxRequests: number;
\twindowSeconds: number;
};

const WF1_RATE_LIMIT_RULES = {
\texpressInterest: {
\t\tendpoint: "wf1:express-interest",
\t\tmaxRequests: 20,
\t\twindowSeconds: 10 * 60,
\t},
\tassetDraftIntent: {
\t\tendpoint: "wf1:asset-draft-intent",
\t\tmaxRequests: 20,
\t\twindowSeconds: 10 * 60,
\t},
\tuploads: {
\t\tendpoint: "wf1:uploads",
\t\tmaxRequests: 60,
\t\twindowSeconds: 10 * 60,
\t},
\tassetAdd: {
\t\tendpoint: "wf1:asset-add",
\t\tmaxRequests: 12,
\t\twindowSeconds: 60 * 60,
\t},
} as const satisfies Record<string, Wf1RateLimitRule>;

export async function assertWf1ExposedPostRateLimit(request: Request, path: string): Promise<void> {
\tif (request.method !== "POST") {
\t\treturn;
\t}

\tconst rule = ruleForWf1Path(path);
\tif (rule === null) {
\t\treturn;
\t}

\tconst db = (await getDb()) as Kysely<AnyDb>;
\tconst result = await checkWf1RateLimit(
\t\tdb,
\t\tgetWf1ClientIp(request),
\t\trule.endpoint,
\t\trule.maxRequests,
\t\trule.windowSeconds,
\t);

\tif (!result.allowed) {
\t\tthrow new DomainError(
\t\t\t"RATE_LIMITED",
\t\t\t"Too many requests. Please wait and try again.",
\t\t\t429,
\t\t);
\t}
}

function ruleForWf1Path(path: string): Wf1RateLimitRule | null {
\tconst parts = path.split("/").filter(Boolean);

\tif (parts.length === 1 && parts[0] === "uploads") {
\t\treturn WF1_RATE_LIMIT_RULES.uploads;
\t}

\tif (parts.length === 3 && parts[0] === "owner" && parts[1] === "assets" && parts[2] === "add") {
\t\treturn WF1_RATE_LIMIT_RULES.assetAdd;
\t}

\tif (parts.length === 3 && parts[0] === "owner" && parts[1] === "assets" && parts[2] === "draft-intent") {
\t\treturn WF1_RATE_LIMIT_RULES.assetDraftIntent;
\t}

\tif (
\t\tparts.length === 4 &&
\t\tparts[0] === "marketplace" &&
\t\tparts[1] === "assets" &&
\t\tparts[2] !== "" &&
\t\tparts[3] === "express-interest"
\t) {
\t\treturn WF1_RATE_LIMIT_RULES.expressInterest;
\t}

\treturn null;
}

export async function checkWf1RateLimit(
\tdb: Kysely<AnyDb>,
\tip: string | null,
\tendpoint: string,
\tmaxRequests: number,
\twindowSeconds: number,
): Promise<Wf1RateLimitResult> {
\tif (!ip) {
\t\treturn { allowed: true, count: 0, limit: maxRequests };
\t}

\tconst windowStart = new Date(
\t\tMath.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000,
\t).toISOString();
\tconst key = `${ip}:${endpoint}`;

\tconst result = await sql<{ count: number }>`
\t\tINSERT INTO _emdash_rate_limits (key, "window", count)
\t\tVALUES (${key}, ${windowStart}, 1)
\t\tON CONFLICT (key, "window")
\t\tDO UPDATE SET count = _emdash_rate_limits.count + 1
\t\tRETURNING count
\t`.execute(db);

\tconst count = result.rows[0]?.count ?? 1;

\tif (Math.random() < 0.01) {
\t\tcleanupExpiredWf1RateLimits(db).catch(() => {
\t\t\t// Best-effort cleanup only; never fail the user request because cleanup failed.
\t\t});
\t}

\treturn {
\t\tallowed: count <= maxRequests,
\t\tcount,
\t\tlimit: maxRequests,
\t};
}

export function getWf1ClientIp(request: Request, trustedHeaders: string[] = []): string | null {
\tconst headers = request.headers;
\tconst cf = (request as unknown as { cf?: Record<string, unknown> }).cf;

\tif (cf) {
\t\tconst cfIp = headers.get("cf-connecting-ip")?.trim();
\t\tif (cfIp && IP_PATTERN.test(cfIp)) {
\t\t\treturn cfIp;
\t\t}

\t\tconst xff = headers.get("x-forwarded-for");
\t\tif (xff) {
\t\t\tconst first = xff.split(",")[0]?.trim();
\t\t\tif (first && IP_PATTERN.test(first)) {
\t\t\t\treturn first;
\t\t\t}
\t\t}
\t}

\tfor (const name of trustedHeaders) {
\t\tconst value = readIpFromHeader(headers, name);
\t\tif (value) return value;
\t}

\treturn null;
}

function readIpFromHeader(headers: Headers, name: string): string | null {
\tconst value = headers.get(name);
\tif (!value) return null;
\tif (name.toLowerCase().endsWith("forwarded-for")) {
\t\tconst first = value.split(",")[0]?.trim();
\t\tif (!first) return null;
\t\treturn IP_PATTERN.test(first) ? first : null;
\t}
\tconst trimmed = value.trim();
\tif (!trimmed) return null;
\treturn IP_PATTERN.test(trimmed) ? trimmed : null;
}

export async function cleanupExpiredWf1RateLimits(
\tdb: Kysely<AnyDb>,
\tmaxAgeSeconds = 3600,
): Promise<number> {
\tconst cutoff = new Date(Date.now() - maxAgeSeconds * 1000).toISOString();
\tconst result = await sql`
\t\tDELETE FROM _emdash_rate_limits WHERE "window" < ${cutoff}
\t`.execute(db);
\treturn Number(result.numAffectedRows ?? 0);
}
'''


def write_rate_limit_file() -> None:
    write("src/lib/wf1/security/rate-limit.ts", WF1_RATE_LIMIT_TS)


def patch_handler_rate_limit() -> None:
    path = "src/lib/wf1/api/handler.ts"
    text = read(path)

    if 'from "../security/rate-limit.js"' not in text:
        text = replace_once(
            text,
            'import { validateLeadProtection } from "../security/lead-guard.js";\n',
            'import { validateLeadProtection } from "../security/lead-guard.js";\nimport { assertWf1ExposedPostRateLimit } from "../security/rate-limit.js";\n',
            "handler rate limit import",
        )

    if "assertWf1ExposedPostRateLimit(input.request, input.path)" not in text:
        text = replace_once(
            text,
            '\t\tconst lane = input.lane ?? "public";\n',
            '\t\tconst lane = input.lane ?? "public";\n\n\t\tawait assertWf1ExposedPostRateLimit(input.request, input.path);\n',
            "handler exposed POST rate limit",
        )

    write(path, text)


def patch_form_guard_client_ip() -> None:
    path = "src/lib/wf1/security/form-guard.ts"
    full = ROOT / path
    if not full.exists():
        print(f"skipped {path}: not found; apply the form guard contract drop-in first")
        return

    text = read(path)

    if 'from "./rate-limit.js"' not in text:
        text = replace_once(
            text,
            'import { turnstileSecretKeyFromEnv, verifyTurnstile } from "./turnstile.js";\n',
            'import { turnstileSecretKeyFromEnv, verifyTurnstile } from "./turnstile.js";\nimport { getWf1ClientIp } from "./rate-limit.js";\n',
            "form guard rate limit client ip import",
        )

    text = text.replace("clientIp(input.request)", "getWf1ClientIp(input.request)")

    old_function = '''export function clientIp(request: Request): string | null {
\treturn (
\t\trequest.headers.get("CF-Connecting-IP") ||
\t\trequest.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
\t\tnull
\t);
}

'''
    text = text.replace(old_function, "")

    write(path, text)


def apply_wf1_rate_limit() -> None:
    write_rate_limit_file()
    patch_handler_rate_limit()
    patch_form_guard_client_ip()
    print("WF1 free EmDash DB-backed rate-limit drop-in complete.")


def main() -> None:
    apply_form_guard_contract()
    apply_wf1_rate_limit()
    print("WF1 form guard + free DB-backed rate-limit combined drop-in complete.")


if __name__ == "__main__":
    main()
