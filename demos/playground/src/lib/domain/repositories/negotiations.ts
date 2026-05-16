import { COLLECTIONS, ROUND_STATE } from "../constants.js";
import type { DomainRow, DomainStore } from "../types.js";

export async function listNegotiationRounds(
	store: DomainStore,
	interestId: string,
): Promise<DomainRow[]> {
	return store.list(
		COLLECTIONS.NEGOTIATION_ROUNDS,
		{ interest_id: interestId },
		{ orderBy: "created_at", direction: "asc", limit: 200 },
	);
}

export async function findAcceptedRound(
	store: DomainStore,
	interestId: string,
	acceptedRoundId?: string,
): Promise<DomainRow | null> {
	if (acceptedRoundId) return store.get(COLLECTIONS.NEGOTIATION_ROUNDS, acceptedRoundId);
	const rounds = await store.list(
		COLLECTIONS.NEGOTIATION_ROUNDS,
		{ interest_id: interestId, round_state: ROUND_STATE.ACCEPTED },
		{ orderBy: "created_at", direction: "desc", limit: 1 },
	);
	return rounds[0] ?? null;
}
