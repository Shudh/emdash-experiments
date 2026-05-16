import { COLLECTIONS } from "../constants.js";
import type { DomainStore } from "../types.js";

export async function getHandoverSessionQuery(store: DomainStore, handoverId: string) {
	const handover = await store.get(COLLECTIONS.HANDOVER_SESSIONS, handoverId);
	if (!handover) return null;
	const checks = await store.list(
		COLLECTIONS.HANDOVER_ITEM_CHECKS,
		{ handover_id: handoverId },
		{ orderBy: "created_at", direction: "asc", limit: 500 },
	);
	const rounds = await store.list(
		COLLECTIONS.NEGOTIATION_ROUNDS,
		{ handover_id: handoverId },
		{ orderBy: "created_at", direction: "asc", limit: 200 },
	);
	return { handover, checks, rounds };
}
