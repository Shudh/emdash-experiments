import { COLLECTIONS } from "../constants.js";
import type { DomainRow, DomainStore } from "../types.js";
import { DomainError } from "../types.js";

export async function getInterestOrThrow(
	store: DomainStore,
	interestId: string,
): Promise<DomainRow> {
	const interest = await store.get(COLLECTIONS.ASSET_INTERESTS, interestId);
	if (!interest) throw new DomainError("INTEREST_NOT_FOUND", "Interest not found", 404);
	return interest;
}

export async function listInterestRounds(
	store: DomainStore,
	interestId: string,
): Promise<DomainRow[]> {
	return store.list(
		COLLECTIONS.NEGOTIATION_ROUNDS,
		{ interest_id: interestId },
		{ orderBy: "created_at", direction: "asc", limit: 200 },
	);
}
