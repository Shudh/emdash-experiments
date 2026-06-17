import {
	filterAssetsForLane,
	isAssetVisibleInLane,
	type Wf1Lane,
} from "../routing/lane.js";
import type { DomainRow, DomainStore, UserContext } from "../../domain/types.js";
import { asString } from "../../domain/types.js";
import {
	WF_ASSET_STATE,
	WF_STATUS,
	WF_VISIBILITY,
	WORKFLOW_RENTAL_COLLECTIONS,
} from "../store/collections.js";
import { actorRoleFor } from "../store/repository.js";
import {
	marketplaceApplicationContextForAsset,
	publicMarketplaceAssetForAsset,
	publicOwnerConditionsForAsset,
	type MarketplaceViewer,
	type MarketplaceViewerRelationship,
} from "./marketplace-public-shape.js";

export type MarketplaceQueryOptions = {
	lane?: Wf1Lane;
};

export async function listWorkflowMarketplaceAssets(
	store: DomainStore,
	user: UserContext | null,
	options: MarketplaceQueryOptions = {},
) {
	const lane = options.lane ?? "public";

	const assets = await store.list(
		WORKFLOW_RENTAL_COLLECTIONS.ASSETS,
		{
			status: WF_STATUS.PUBLISHED,
			business_state: WF_ASSET_STATE.LISTED,
			visibility_state: WF_VISIBILITY.MARKETPLACE,
		},
		{ orderBy: "published_at", direction: "desc", limit: 100 },
	);

	const visibleAssets = filterAssetsForLane(assets, lane);

	return Promise.all(visibleAssets.map((asset) => withViewer(store, user, asset)));
}

export async function getWorkflowMarketplaceAsset(
	store: DomainStore,
	user: UserContext | null,
	assetId: string,
	options: MarketplaceQueryOptions = {},
) {
	const asset = await store.get(WORKFLOW_RENTAL_COLLECTIONS.ASSETS, assetId);
	if (!asset) return null;

	const lane = options.lane ?? "public";

	if (!isAssetVisibleInLane(asset, lane)) {
		return null;
	}

	const interest = user
		? await store.findOne(WORKFLOW_RENTAL_COLLECTIONS.INTERESTS, {
				asset_id: asset.id,
				interested_user_id: user.id,
			})
		: null;

	const workflowInstance = interest
		? await findWorkflowInstanceForInterest(store, interest.id)
		: null;

	const role = actorRoleFor(user, asset, interest);
	const isPublic =
		asset.status === WF_STATUS.PUBLISHED &&
		asset.business_state === WF_ASSET_STATE.LISTED &&
		asset.visibility_state === WF_VISIBILITY.MARKETPLACE;

	if (!isPublic && role !== "owner" && role !== "applicant" && role !== "renter") {
		return null;
	}

	return {
		asset: publicMarketplaceAssetForAsset(
			asset,
			viewerForAsset(asset, role, interest, workflowInstance),
		),
		ownerConditions: publicOwnerConditionsForAsset(asset),
		application: marketplaceApplicationContextForAsset(asset),
	};
}

async function withViewer(store: DomainStore, user: UserContext | null, asset: DomainRow) {
	const interest = user
		? await store.findOne(WORKFLOW_RENTAL_COLLECTIONS.INTERESTS, {
				asset_id: asset.id,
				interested_user_id: user.id,
			})
		: null;

	const workflowInstance = interest
		? await findWorkflowInstanceForInterest(store, interest.id)
		: null;

	return publicMarketplaceAssetForAsset(
		asset,
		viewerForAsset(asset, actorRoleFor(user, asset, interest), interest, workflowInstance),
	);
}

async function findWorkflowInstanceForInterest(
	store: DomainStore,
	interestId: string,
): Promise<DomainRow | null> {
	return store.findOne(WORKFLOW_RENTAL_COLLECTIONS.WORKFLOW_INSTANCES, {
		interest_id: interestId,
	});
}

function viewerForAsset(
	asset: DomainRow,
	role: string,
	interest: DomainRow | null,
	workflowInstance: DomainRow | null,
): MarketplaceViewer {
	const canExpressInterest =
		role !== "anonymous" &&
		role !== "owner" &&
		role !== "applicant" &&
		role !== "renter" &&
		!interest;

	const relationship: MarketplaceViewerRelationship =
		role === "owner"
			? "owner"
			: role === "renter"
				? "renter"
				: role === "applicant" && interest
					? "interested_applicant"
					: role === "anonymous"
						? "anonymous"
						: "logged_in";

	if (relationship === "owner") {
		return {
			relationship,
			role,
			canExpressInterest: false,
			message: "This is your asset",
		};
	}

	if (relationship === "renter") {
		return {
			relationship,
			role,
			canExpressInterest: false,
			interestId: interest?.id ?? asString(asset.active_interest_id),
			interestState: asString(interest?.interest_state),
			workflowInstanceId: workflowInstance?.id ?? asString(asset.active_workflow_instance_id),
			message: "You are the tenant for this asset",
		};
	}

	if (relationship === "interested_applicant") {
		return {
			relationship,
			role,
			canExpressInterest: false,
			interestId: interest?.id ?? "",
			interestState: asString(interest?.interest_state),
			workflowInstanceId: workflowInstance?.id ?? "",
		};
	}

	if (relationship === "anonymous") {
		return {
			relationship,
			role,
			canExpressInterest: false,
		};
	}

	return {
		relationship,
		role,
		canExpressInterest,
	};
}
