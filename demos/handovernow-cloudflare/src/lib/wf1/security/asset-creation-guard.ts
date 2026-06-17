import { DomainError, asString } from "../../domain/types.js";
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
