import { COLLECTIONS } from "../constants.js";
import type { DomainRow, DomainStore } from "../types.js";
import { DomainError } from "../types.js";

export async function getAgreementOrThrow(
	store: DomainStore,
	agreementId: string,
): Promise<DomainRow> {
	const agreement = await store.get(COLLECTIONS.AGREEMENT_VERSIONS, agreementId);
	if (!agreement) throw new DomainError("AGREEMENT_NOT_FOUND", "Agreement not found", 404);
	return agreement;
}

export async function listAgreementTerms(
	store: DomainStore,
	agreementId: string,
): Promise<DomainRow[]> {
	return store.list(
		COLLECTIONS.AGREEMENT_TERMS,
		{ agreement_id: agreementId },
		{ orderBy: "created_at", direction: "asc", limit: 100 },
	);
}
