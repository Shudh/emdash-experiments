import { COLLECTIONS } from "../constants.js";
import type { DomainStore } from "../types.js";

export async function listOwnerAssetsQuery(store: DomainStore, ownerUserId: string) {
	return store.list(
		COLLECTIONS.ASSETS,
		{ owner_user_id: ownerUserId },
		{ orderBy: "updated_at", direction: "desc", limit: 100 },
	);
}

export async function listOwnerInterestsQuery(store: DomainStore, ownerUserId: string) {
	return store.list(
		COLLECTIONS.ASSET_INTERESTS,
		{ owner_user_id: ownerUserId },
		{ orderBy: "created_at", direction: "desc", limit: 100 },
	);
}
