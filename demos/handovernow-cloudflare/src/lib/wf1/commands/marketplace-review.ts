import type { DomainStore, UserContext } from "../../domain/types.js";
import { asJsonObject, asString, DomainError } from "../../domain/types.js";
import { WF_ASSET_STATE, WF_VISIBILITY, WORKFLOW_RENTAL_COLLECTIONS } from "../store/collections.js";
import { appendWorkflowEvent, getAssetOrThrow } from "../store/repository.js";
import { isAssetVisibleInLane, type Wf1Lane } from "../routing/lane.js";
import { publishWorkflowAsset } from "./publish-asset.js";
import {
	assertWf1Superadmin,
	MARKETPLACE_REVIEW_EVENT,
	marketplaceReviewSnapshot,
	requireReviewReason,
	safeAdminAssetSummary,
} from "../core/marketplace-review.js";

export type RequestMarketplaceReviewInput = {
	lane: Wf1Lane;
	summary?: string;
	requestSpec?: Record<string, unknown>;
};

export type RejectMarketplaceReviewInput = {
	lane: Wf1Lane;
	reason?: string;
	reviewSpec?: Record<string, unknown>;
};

export type ApproveMarketplaceReviewInput = {
	lane: Wf1Lane;
};

export async function requestMarketplaceReview(
	store: DomainStore,
	user: UserContext,
	assetId: string,
	input: RequestMarketplaceReviewInput,
) {
	return store.transaction(async (tx) => {
		const asset = await getAssetOrThrow(tx, assetId);

		assertReviewableAssetInLane(asset, input.lane);

		if (asString(asset.owner_user_id) !== user.id) {
			throw new DomainError("FORBIDDEN", "Only the asset owner can request marketplace review", 403);
		}

		if (asString(asset.visibility_state) === WF_VISIBILITY.MARKETPLACE) {
			throw new DomainError("ALREADY_MARKETPLACE", "Asset is already visible in the marketplace", 409);
		}

		const events = await tx.list(
			WORKFLOW_RENTAL_COLLECTIONS.ASSET_EVENTS,
			{ asset_id: asset.id },
			{ orderBy: "created_at", direction: "desc", limit: 50 },
		);
		const review = marketplaceReviewSnapshot(events);

		if (review.state === "requested") {
			return {
				asset,
				review: {
					...review,
					alreadyRequested: true,
				},
			};
		}

		const event = await appendWorkflowEvent(tx, {
			asset,
			eventKind: MARKETPLACE_REVIEW_EVENT.REQUESTED,
			actor: user,
			actorRole: "owner",
			fromAssetState: asString(asset.business_state),
			toAssetState: asString(asset.business_state),
			eventSpec: {
				lane: input.lane,
				summary: input.summary || safeAdminAssetSummary(asset),
				requestSpec: input.requestSpec ?? {},
				previousReviewState: review.state,
				previousReviewEventId: review.event?.id ?? null,
			},
		});

		return {
			asset,
			event,
			review: marketplaceReviewSnapshot([event]),
		};
	});
}

export async function approveMarketplaceReview(
	store: DomainStore,
	user: UserContext,
	assetId: string,
	input: ApproveMarketplaceReviewInput,
) {
	assertWf1Superadmin(user);

	const asset = await getAssetOrThrow(store, assetId);
	assertReviewableAssetInLane(asset, input.lane);

	const events = await store.list(
		WORKFLOW_RENTAL_COLLECTIONS.ASSET_EVENTS,
		{ asset_id: asset.id },
		{ orderBy: "created_at", direction: "desc", limit: 50 },
	);
	const review = marketplaceReviewSnapshot(events);

	if (review.state !== "requested") {
		throw new DomainError(
			"MARKETPLACE_REVIEW_NOT_REQUESTED",
			"Asset is not currently waiting for marketplace review",
			409,
		);
	}

	const result = await publishWorkflowAsset(store, user, asset.id);

	return {
		...result,
		review: {
			state: "published",
			approvedFromReviewEventId: review.event?.id ?? null,
		},
	};
}

export async function rejectMarketplaceReview(
	store: DomainStore,
	user: UserContext,
	assetId: string,
	input: RejectMarketplaceReviewInput,
) {
	assertWf1Superadmin(user);

	const reason = requireReviewReason(input.reason);

	return store.transaction(async (tx) => {
		const asset = await getAssetOrThrow(tx, assetId);
		assertReviewableAssetInLane(asset, input.lane);

		const events = await tx.list(
			WORKFLOW_RENTAL_COLLECTIONS.ASSET_EVENTS,
			{ asset_id: asset.id },
			{ orderBy: "created_at", direction: "desc", limit: 50 },
		);
		const review = marketplaceReviewSnapshot(events);

		if (review.state !== "requested") {
			throw new DomainError(
				"MARKETPLACE_REVIEW_NOT_REQUESTED",
				"Asset is not currently waiting for marketplace review",
				409,
			);
		}

		const event = await appendWorkflowEvent(tx, {
			asset,
			eventKind: MARKETPLACE_REVIEW_EVENT.REJECTED,
			actor: user,
			actorRole: "admin",
			fromAssetState: asString(asset.business_state),
			toAssetState: asString(asset.business_state),
			eventSpec: {
				lane: input.lane,
				reason,
				reviewSpec: input.reviewSpec ?? {},
				rejectedFromReviewEventId: review.event?.id ?? null,
			},
		});

		return {
			asset,
			event,
			review: {
				...marketplaceReviewSnapshot([event]),
				reason,
			},
		};
	});
}

function assertReviewableAssetInLane(asset: Record<string, unknown>, lane: Wf1Lane): void {
	if (!isAssetVisibleInLane(asset, lane)) {
		throw new DomainError("ASSET_NOT_FOUND", "Asset was not found in this lane", 404);
	}

	const businessState = asString(asset.business_state);
	if (businessState !== WF_ASSET_STATE.DRAFT_ASSET && businessState !== WF_ASSET_STATE.LISTED) {
		throw new DomainError(
			"ASSET_NOT_REVIEWABLE",
			"Only draft or listed assets can be reviewed for marketplace publishing",
			409,
		);
	}

	if (asString(asset.visibility_state) === WF_VISIBILITY.MARKETPLACE) {
		throw new DomainError("ALREADY_MARKETPLACE", "Asset is already visible in the marketplace", 409);
	}

	const configSpec = asJsonObject(asset.config_spec);
	if (lane === "test") {
		const testLane = asJsonObject(configSpec.testLane);
		if (testLane.enabled !== true && testLane.enabled !== 1) {
			throw new DomainError("ASSET_NOT_FOUND", "Asset was not found in this lane", 404);
		}
	}
}
