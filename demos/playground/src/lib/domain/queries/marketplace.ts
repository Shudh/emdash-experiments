import { ASSET_BUSINESS_STATE, CMS_STATUS, COLLECTIONS, VISIBILITY_STATE } from "../constants.js";
import type { DomainStore } from "../types.js";

export async function listMarketplaceAssetsQuery(store: DomainStore) {
	return store.list(
		COLLECTIONS.ASSETS,
		{
			status: CMS_STATUS.PUBLISHED,
			visibility_state: VISIBILITY_STATE.MARKETPLACE,
			business_state: [
				ASSET_BUSINESS_STATE.LISTED,
				ASSET_BUSINESS_STATE.INTEREST_RECEIVED,
				ASSET_BUSINESS_STATE.NEGOTIATING,
			],
		},
		{ orderBy: "published_at", direction: "desc", limit: 50 },
	);
}
