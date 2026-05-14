import { DomainError, assertFound } from "../errors.js";
import { createId, nowIso } from "../ids.js";
import type {
	AcceptHandoverInput,
	ClaimDamageInput,
	RentalDomainStore,
	SettleHandoverInput,
	StartHandoverInput,
} from "../types.js";

export async function startHandover(store: RentalDomainStore, input: StartHandoverInput) {
	const asset = assertFound(
		await store.getAsset(input.assetId),
		"ASSET_NOT_FOUND",
		"Asset not found",
	);
	assertFound(
		await store.getAgreement(input.agreementId),
		"AGREEMENT_NOT_FOUND",
		"Agreement not found",
	);
	if (asset.visibility_state !== "restricted")
		throw new DomainError("ASSET_NOT_BOOKED", "Asset must be booked before handover starts");
	const now = nowIso();
	const handover = await store.createHandover({
		id: createId("handover"),
		slug: `${asset.slug}-handover`,
		now,
		assetId: asset.id,
		agreementId: input.agreementId,
	});
	const items = await store.listAssetConfigItems(asset.id);
	const checks = await store.createHandoverChecks(handover.id, items, now);
	return { handover, checks };
}

export async function acceptHandover(store: RentalDomainStore, input: AcceptHandoverInput) {
	const handover = assertFound(
		await store.getHandover(input.handoverId),
		"HANDOVER_NOT_FOUND",
		"Handover not found",
	);
	const now = nowIso();
	await store.updateHandover(handover.id, { handover_state: "accepted", updated_at: now });
	return store.updateAsset(handover.asset_id, { business_state: "rented", updated_at: now });
}

export async function claimDamage(store: RentalDomainStore, input: ClaimDamageInput) {
	const handover = assertFound(
		await store.getHandover(input.handoverId),
		"HANDOVER_NOT_FOUND",
		"Handover not found",
	);
	const checks = await store.listHandoverChecks(handover.id);
	const check = checks.find((item) => item.id === input.itemCheckId);
	if (!check) throw new DomainError("HANDOVER_CHECK_NOT_FOUND", "Handover item check not found");
	const now = nowIso();
	const updatedCheck = await store.updateHandoverCheck(check.id, {
		return_condition: input.returnCondition,
		dispute_state: "open",
		dispute_notes: input.disputeNotes,
		updated_at: now,
	});
	const round = await store.createRound({
		interestId: handover.agreement_id,
		assetId: handover.asset_id,
		handoverId: handover.id,
		actorId: input.actorId,
		roundPhase: "return",
		roundKind: "question",
		terms: {
			itemCheckId: check.id,
			returnCondition: input.returnCondition,
			disputeNotes: input.disputeNotes,
		},
		id: createId("round"),
		slug: `${handover.id}-return-${check.id}`,
		now,
	});
	await store.updateHandover(handover.id, { handover_state: "return_open", updated_at: now });
	return { check: updatedCheck, round };
}

export async function settleHandover(store: RentalDomainStore, input: SettleHandoverInput) {
	const handover = assertFound(
		await store.getHandover(input.handoverId),
		"HANDOVER_NOT_FOUND",
		"Handover not found",
	);
	const now = nowIso();
	const updatedHandover = await store.updateHandover(handover.id, {
		handover_state: "settled",
		updated_at: now,
	});
	const asset = await store.updateAsset(handover.asset_id, {
		business_state: "maintenance",
		visibility_state: "private",
		updated_at: now,
	});
	return { handover: updatedHandover, asset };
}
