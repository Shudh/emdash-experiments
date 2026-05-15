import { COLLECTIONS } from "../constants.js";
import type { DomainRow, DomainStore } from "../types.js";
import { DomainError } from "../types.js";

export async function getHandoverOrThrow(
	store: DomainStore,
	handoverId: string,
): Promise<DomainRow> {
	const handover = await store.get(COLLECTIONS.HANDOVER_SESSIONS, handoverId);
	if (!handover) throw new DomainError("HANDOVER_NOT_FOUND", "Handover not found", 404);
	return handover;
}

export async function listHandoverChecks(
	store: DomainStore,
	handoverId: string,
): Promise<DomainRow[]> {
	return store.list(
		COLLECTIONS.HANDOVER_ITEM_CHECKS,
		{ handover_id: handoverId },
		{ orderBy: "created_at", direction: "asc", limit: 300 },
	);
}
