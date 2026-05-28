import { DomainError, asString } from "../../domain/types.js";
import type { DomainStore, UserContext } from "../../domain/types.js";
import {
	WF_ASSET_STATE,
	WF_STATUS,
	WF_VISIBILITY,
	WORKFLOW_RENTAL_COLLECTIONS,
} from "../store/collections.js";
import { appendWorkflowEvent, getAssetOrThrow } from "../store/repository.js";

const ADMIN_ROLE = "50";

function isAdminUser(user: UserContext): boolean {
	return String(user.role ?? "") === ADMIN_ROLE || user.email === "shudh.datta@gmail.com";
}

export async function publishWorkflowAsset(store: DomainStore, user: UserContext, assetId: string) {
	return store.transaction(async (tx) => {
		const asset = await getAssetOrThrow(tx, assetId);

		if (!isAdminUser(user)) {
			throw new DomainError(
				"PUBLISH_REQUIRES_ADMIN_REVIEW",
				"Marketplace publishing is currently admin-reviewed. The asset remains saved as a draft.",
				403,
			);
		}

		const updated = await tx.update(WORKFLOW_RENTAL_COLLECTIONS.ASSETS, asset.id, {
			status: WF_STATUS.PUBLISHED,
			business_state: WF_ASSET_STATE.LISTED,
			visibility_state: WF_VISIBILITY.MARKETPLACE,
			published_at: tx.now(),
		});

		await appendWorkflowEvent(tx, {
			asset: updated,
			eventKind: "asset_published",
			actor: user,
			actorRole: asString(asset.owner_user_id) === user.id ? "owner" : "admin",
			fromAssetState: asString(asset.business_state),
			toAssetState: WF_ASSET_STATE.LISTED,
			eventSpec: {
				visibility: WF_VISIBILITY.MARKETPLACE,
				previousVisibility: asString(asset.visibility_state),
				adminReviewed: true,
				publishedForOwnerUserId: asString(asset.owner_user_id),
			},
		});

		return { asset: updated };
	});
}