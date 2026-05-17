import type { AddNegotiationRoundRequest } from "../api-contracts.js";
import { CMS_STATUS, COLLECTIONS, ROUND_STATE } from "../constants.js";
import {
	assertOperationAllowed,
	resolveHandoverRoundOperation,
} from "../operations.js";
import { resolveHandoverRelationship } from "../relationship.js";
import { getHandoverOrThrow } from "../repositories/handover.js";
import type { DomainStore, UserContext } from "../types.js";
import { asString } from "../types.js";

export async function addHandoverNegotiationRound(
	store: DomainStore,
	user: UserContext,
	handoverId: string,
	input: AddNegotiationRoundRequest,
) {
	const relationship = await resolveHandoverRelationship(store, user, handoverId);
	const operationId = resolveHandoverRoundOperation(input, relationship.role);
	assertOperationAllowed(operationId, relationship.role);
	const handover = await getHandoverOrThrow(store, handoverId);
	const ownerUserId = asString(handover.owner_user_id);
	const renterUserId = asString(handover.renter_user_id);
	const actorRole = relationship.role === "owner" ? "owner" : "renter";
	const round = await store.insert(COLLECTIONS.NEGOTIATION_ROUNDS, {
		status: CMS_STATUS.PUBLISHED,
		author_id: user.id,
		asset_id: asString(handover.asset_id),
		interest_id: null,
		agreement_id: asString(handover.agreement_id) || null,
		handover_id: handoverId,
		owner_user_id: ownerUserId,
		renter_user_id: renterUserId,
		actor_user_id: user.id,
		actor_role: actorRole,
		round_phase: input.roundPhase,
		round_kind: input.roundKind,
		round_state: input.roundState ?? ROUND_STATE.PROPOSED,
		price: input.price ?? null,
		currency: input.currency ?? null,
		minimum_months: input.minimumMonths ?? null,
		km_limit: input.kmLimit ?? null,
		deposit_amount: input.depositAmount ?? null,
		start_date: input.startDate ?? null,
		end_date: input.endDate ?? null,
		message: input.message ?? null,
		proposed_patch: input.proposedPatch ?? {},
		terms_spec: input.termsSpec ?? {},
	});
	return { round, handover };
}
