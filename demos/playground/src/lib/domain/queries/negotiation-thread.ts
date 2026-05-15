import { COLLECTIONS } from "../constants.js";
import type { DomainStore } from "../types.js";

export async function getNegotiationThreadQuery(store: DomainStore, interestId: string) {
	const interest = await store.get(COLLECTIONS.ASSET_INTERESTS, interestId);
	if (!interest) return null;
	const asset =
		typeof interest.asset_id === "string"
			? await store.get(COLLECTIONS.ASSETS, interest.asset_id)
			: null;
	const rounds = await store.list(
		COLLECTIONS.NEGOTIATION_ROUNDS,
		{ interest_id: interestId },
		{ orderBy: "created_at", direction: "asc", limit: 200 },
	);
	return { interest, asset, rounds };
}
