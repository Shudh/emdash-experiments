import { DomainError, asString } from "../../domain/types.js";
import type { DomainStore, UserContext } from "../../domain/types.js";
import {
	WF_ASSET_STATE,
	WF_STATUS,
	WF_VISIBILITY,
	WORKFLOW_RENTAL_COLLECTIONS,
} from "../store/collections.js";
import { appendWorkflowEvent, getAssetOrThrow } from "../store/repository.js";

export async function publishWorkflowAsset(store: DomainStore, user: UserContext, assetId: string) {
	return store.transaction(async (tx) => {
		const asset = await getAssetOrThrow(tx, assetId);
		if (asString(asset.owner_user_id) !== user.id) {
			throw new DomainError("FORBIDDEN", "Only the owner can publish this asset", 403);
		}
		const updated = await tx.update(WORKFLOW_RENTAL_COLLECTIONS.ASSETS, assetId, {
			status: WF_STATUS.PUBLISHED,
			business_state: WF_ASSET_STATE.LISTED,
			visibility_state: WF_VISIBILITY.MARKETPLACE,
			published_at: tx.now(),
		});
		await appendWorkflowEvent(tx, {
			asset: updated,
			eventKind: "asset_published",
			actor: user,
			actorRole: "owner",
			fromAssetState: asString(asset.business_state),
			toAssetState: WF_ASSET_STATE.LISTED,
		});
		return { asset: updated };
	});
}
