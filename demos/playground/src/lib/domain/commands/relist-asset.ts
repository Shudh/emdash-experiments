import { requireAssetOwner } from "../auth.js";
import { ASSET_BUSINESS_STATE, COLLECTIONS, EVENT_KIND, VISIBILITY_STATE } from "../constants.js";
import { appendAssetEvent } from "../events.js";
import { getAssetOrThrow, publishAssetCmsState } from "../repositories/assets.js";
import { assertAllowedAssetTransition } from "../transitions.js";
import type { DomainStore, UserContext } from "../types.js";
import { asString } from "../types.js";

export async function relistAsset(store: DomainStore, user: UserContext, assetId: string) {
	return store.transaction(async (tx) => {
		await requireAssetOwner(tx, user, assetId);
		const asset = await getAssetOrThrow(tx, assetId);
		const fromState = asString(asset.business_state);
		assertAllowedAssetTransition(fromState, ASSET_BUSINESS_STATE.LISTED, "relistAsset");
		await tx.update(COLLECTIONS.ASSETS, assetId, {
			business_state: ASSET_BUSINESS_STATE.LISTED,
			visibility_state: VISIBILITY_STATE.MARKETPLACE,
		});
		const published = await publishAssetCmsState(tx, assetId);
		await appendAssetEvent(tx, {
			assetId,
			eventKind: EVENT_KIND.ASSET_RELISTED,
			actor: user,
			fromBusinessState: fromState,
			toBusinessState: ASSET_BUSINESS_STATE.LISTED,
			eventSpec: { visibilityState: VISIBILITY_STATE.MARKETPLACE },
		});
		return { asset: published };
	});
}
