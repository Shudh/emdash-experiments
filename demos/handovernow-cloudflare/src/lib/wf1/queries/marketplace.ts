import type { DomainRow, DomainStore, UserContext } from "../../domain/types.js";
import { asString } from "../../domain/types.js";
import {
	WF_ASSET_STATE,
	WF_STATUS,
	WF_VISIBILITY,
	WORKFLOW_RENTAL_COLLECTIONS,
} from "../store/collections.js";
import { actorRoleFor } from "../store/repository.js";

type MarketplaceViewerRelationship = "anonymous" | "owner" | "interested_applicant" | "logged_in";

export async function listWorkflowMarketplaceAssets(store: DomainStore, user: UserContext | null) {
	const assets = await store.list(
		WORKFLOW_RENTAL_COLLECTIONS.ASSETS,
		{
			status: WF_STATUS.PUBLISHED,
			business_state: WF_ASSET_STATE.LISTED,
			visibility_state: WF_VISIBILITY.MARKETPLACE,
		},
		{ orderBy: "published_at", direction: "desc", limit: 100 },
	);

	return Promise.all(assets.map((asset) => withViewer(store, user, asset)));
}

export async function getWorkflowMarketplaceAsset(
	store: DomainStore,
	user: UserContext | null,
	assetId: string,
) {
	const asset = await store.get(WORKFLOW_RENTAL_COLLECTIONS.ASSETS, assetId);
	if (!asset) return null;

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

	if (!isPublic && role !== "owner" && role !== "applicant" && role !== "renter") return null;

	return {
		asset: viewerAsset(asset, role, interest, workflowInstance),
		ownerConditions: {
			version: asset.conditions_version,
			hash: asset.conditions_hash,
			spec: asset.owner_conditions_spec,
		},
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

	return viewerAsset(asset, actorRoleFor(user, asset, interest), interest, workflowInstance);
}

async function findWorkflowInstanceForInterest(
	store: DomainStore,
	interestId: string,
): Promise<DomainRow | null> {
	return store.findOne(WORKFLOW_RENTAL_COLLECTIONS.WORKFLOW_INSTANCES, {
		interest_id: interestId,
	});
}

function viewerAsset(
	asset: DomainRow,
	role: string,
	interest: DomainRow | null,
	workflowInstance: DomainRow | null,
) {
	const canExpressInterest = role !== "anonymous" && role !== "owner" && !interest;
	const relationship: MarketplaceViewerRelationship =
		role === "owner"
			? "owner"
			: interest
				? "interested_applicant"
				: role === "anonymous"
					? "anonymous"
					: "logged_in";

	const viewer =
		relationship === "owner"
			? {
					relationship,
					canExpressInterest: false,
					message: "This is your asset",
				}
			: relationship === "interested_applicant"
				? {
						relationship,
						canExpressInterest: false,
						interestId: interest?.id ?? "",
						interestState: asString(interest?.interest_state),
						workflowInstanceId: workflowInstance?.id ?? "",
					}
				: relationship === "anonymous"
					? {
							relationship,
							canExpressInterest: false,
						}
					: {
							relationship,
							canExpressInterest,
						};

	return { ...asset, viewer };
}
