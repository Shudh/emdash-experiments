import { COLLECTIONS } from "../constants.js";
import type { DomainStore } from "../types.js";

export async function getAgreementPrintQuery(store: DomainStore, agreementId: string) {
	const agreement = await store.get(COLLECTIONS.AGREEMENT_VERSIONS, agreementId);
	if (!agreement) return null;
	const terms = await store.list(
		COLLECTIONS.AGREEMENT_TERMS,
		{ agreement_id: agreementId },
		{ orderBy: "created_at", direction: "asc", limit: 200 },
	);
	return { agreement, terms };
}
