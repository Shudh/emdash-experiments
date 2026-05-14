import { DomainError, assertFound } from "../errors.js";
import { createId, nowIso } from "../ids.js";
import type { AcceptFinalTermsInput, AddRoundInput, RentalDomainStore } from "../types.js";

const allowedKinds = new Set(["offer", "counter", "question", "answer", "acceptance"]);

export async function addNegotiationRound(store: RentalDomainStore, input: AddRoundInput) {
	if (!allowedKinds.has(input.roundKind))
		throw new DomainError("INVALID_ROUND_KIND", "Round kind is not supported");
	const interest = assertFound(
		await store.getInterest(input.interestId),
		"INTEREST_NOT_FOUND",
		"Interest not found",
	);
	const now = nowIso();
	return store.createRound({
		...input,
		assetId: interest.asset_id,
		id: createId("round"),
		slug: `${input.interestId}-${Date.now()}`,
		now,
	});
}

export async function acceptFinalTerms(store: RentalDomainStore, input: AcceptFinalTermsInput) {
	const interest = assertFound(
		await store.getInterest(input.interestId),
		"INTEREST_NOT_FOUND",
		"Interest not found",
	);
	const asset = assertFound(
		await store.getAsset(interest.asset_id),
		"ASSET_NOT_FOUND",
		"Asset not found",
	);
	const rounds = await store.listRounds(input.interestId);
	const now = nowIso();
	await store.createRound({
		interestId: input.interestId,
		actorId: input.actorId,
		roundKind: "acceptance",
		roundPhase: "pre_agreement",
		terms: input.finalTerms,
		assetId: asset.id,
		id: createId("round"),
		slug: `${input.interestId}-acceptance`,
		now,
		roundState: "accepted",
	});
	const snapshot = {
		asset: JSON.parse(JSON.stringify(asset)),
		interest: JSON.parse(JSON.stringify(interest)),
		rounds: JSON.parse(JSON.stringify(rounds)),
		finalTerms: JSON.parse(JSON.stringify(input.finalTerms)),
		frozenAt: now,
	};
	const agreement = await store.createAgreement({
		id: createId("agreement"),
		slug: `${asset.slug}-${input.interestId}`,
		now,
		assetId: asset.id,
		interestId: input.interestId,
		printableSnapshot: snapshot,
	});
	const terms = await store.createAgreementTerms(agreement.id, input.finalTerms, now);
	const updatedAsset = await store.updateAsset(asset.id, {
		business_state: "booked",
		visibility_state: "restricted",
		updated_at: now,
	});
	return { agreement, terms, asset: updatedAsset };
}
