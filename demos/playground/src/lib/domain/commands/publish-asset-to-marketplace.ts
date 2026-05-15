import { requireAssetOwner } from "../auth.js";
import { ASSET_BUSINESS_STATE, EVENT_KIND, VISIBILITY_STATE } from "../constants.js";
import { COLLECTIONS } from "../constants.js";
import { appendAssetEvent } from "../events.js";
import { getAssetOrThrow, publishAssetCmsState } from "../repositories/assets.js";
import { assertAllowedAssetTransition } from "../transitions.js";
import type { DomainStore, UserContext } from "../types.js";
import { DomainError, asString } from "../types.js";

export async function publishAssetToMarketplace(
	store: DomainStore,
	user: UserContext,
	assetId: string,
) {
	await requireAssetOwner(store, user, assetId);
	const asset = await getAssetOrThrow(store, assetId);
	const fromState = asString(asset.business_state);
	assertAllowedAssetTransition(fromState, ASSET_BUSINESS_STATE.LISTED, "publishAssetToMarketplace");
	if (!asset.title || !asset.asset_kind)
		throw new DomainError("ASSET_INCOMPLETE", "Asset title and kind are required", 422);
	if (!asset.config_spec || typeof asset.config_spec !== "object")
		throw new DomainError("ASSET_INCOMPLETE", "Asset config_spec is required", 422);
	const updated = await store.update(COLLECTIONS.ASSETS, assetId, {
		business_state: ASSET_BUSINESS_STATE.LISTED,
		visibility_state: VISIBILITY_STATE.MARKETPLACE,
	});
	const published = await publishAssetCmsState(store, assetId);
	await appendAssetEvent(store, {
		assetId,
		eventKind: EVENT_KIND.ASSET_PUBLISHED,
		actor: user,
		fromBusinessState: fromState,
		toBusinessState: ASSET_BUSINESS_STATE.LISTED,
		eventSpec: {
			visibilityState: VISIBILITY_STATE.MARKETPLACE,
			updatedVersion: updated.version,
			publishedVersion: published.version,
		},
	});
	return { asset: published };
}
