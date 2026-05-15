import { COLLECTIONS } from "../constants.js";
import type { DomainStore } from "../types.js";

export async function listRenterInterestsQuery(store: DomainStore, renterUserId: string) {
	return store.list(
		COLLECTIONS.ASSET_INTERESTS,
		{ interested_user_id: renterUserId },
		{ orderBy: "created_at", direction: "desc", limit: 100 },
	);
}

export async function listRenterAssetAccessQuery(store: DomainStore, renterUserId: string) {
	return store.list(
		COLLECTIONS.ASSET_ACCESS,
		{ user_id: renterUserId, access_role: "renter", access_state: "active" },
		{ orderBy: "created_at", direction: "desc", limit: 100 },
	);
}
