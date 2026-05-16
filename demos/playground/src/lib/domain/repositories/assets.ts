import { COLLECTIONS, CMS_STATUS } from "../constants.js";
import type { DomainRow, DomainStore } from "../types.js";
import { DomainError } from "../types.js";

export async function getAssetOrThrow(store: DomainStore, assetId: string): Promise<DomainRow> {
	const asset = await store.get(COLLECTIONS.ASSETS, assetId);
	if (!asset) throw new DomainError("ASSET_NOT_FOUND", "Asset not found", 404);
	return asset;
}

export async function publishAssetCmsState(
	store: DomainStore,
	assetId: string,
): Promise<DomainRow> {
	const now = store.now();
	return store.update(COLLECTIONS.ASSETS, assetId, {
		status: CMS_STATUS.PUBLISHED,
		published_at: now,
		scheduled_at: null,
		live_revision_id: `live_${assetId}_${Date.now()}`,
		draft_revision_id: null,
	});
}

export async function draftAssetCmsState(store: DomainStore, assetId: string): Promise<DomainRow> {
	return store.update(COLLECTIONS.ASSETS, assetId, {
		status: CMS_STATUS.DRAFT,
		published_at: null,
		scheduled_at: null,
		draft_revision_id: `draft_${assetId}_${Date.now()}`,
	});
}

export async function listMarketplaceAssets(store: DomainStore): Promise<DomainRow[]> {
	return store.list(
		COLLECTIONS.ASSETS,
		{
			status: CMS_STATUS.PUBLISHED,
			visibility_state: "marketplace",
			business_state: ["listed", "interest_received", "negotiating"],
		},
		{ orderBy: "published_at", direction: "desc", limit: 50 },
	);
}
