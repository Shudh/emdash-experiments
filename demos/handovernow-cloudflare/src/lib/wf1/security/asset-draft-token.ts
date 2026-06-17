import { DomainError } from "../../domain/types.js";
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

function textBytes(value: string): Uint8Array<ArrayBuffer> {
	const bytes = new TextEncoder().encode(value);
	const copy = new Uint8Array(bytes.byteLength);
	copy.set(bytes);
	return copy;
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
