import type { ClaimHandoverDamageRequest } from "../api-contracts.js";
import {
	CMS_STATUS,
	COLLECTIONS,
	DISPUTE_STATE,
	EVENT_KIND,
	HANDOVER_STATE,
	ROUND_KIND,
	ROUND_PHASE,
	ROUND_STATE,
} from "../constants.js";
import { appendAssetEvent } from "../events.js";
import { assertOperationAllowed } from "../operations.js";
import { resolveHandoverRelationship } from "../relationship.js";
import { getHandoverOrThrow } from "../repositories/handover.js";
import type { DomainStore, UserContext } from "../types.js";
import { DomainError, asString } from "../types.js";

export async function claimHandoverDamage(
	store: DomainStore,
	user: UserContext,
	handoverId: string,
	input: ClaimHandoverDamageRequest,
) {
	return store.transaction(async (tx) => {
		const relationship = await resolveHandoverRelationship(tx, user, handoverId);
		assertOperationAllowed("handover.owner_claim_damage", relationship.role);
		const handover = await getHandoverOrThrow(tx, handoverId);
		const check = await tx.get(COLLECTIONS.HANDOVER_ITEM_CHECKS, input.handoverItemCheckId);
		if (!check)
			throw new DomainError("HANDOVER_ITEM_CHECK_NOT_FOUND", "Handover item check not found", 404);
		if (asString(check.handover_id) !== handoverId) {
			throw new DomainError(
				"HANDOVER_ITEM_CHECK_NOT_FOUND",
				"Handover item check not found for this handover",
				404,
			);
		}
		const updatedCheck = await tx.update(COLLECTIONS.HANDOVER_ITEM_CHECKS, check.id, {
			owner_claimed_state: input.ownerClaimedState,
			observed_state: input.observedState ?? check.observed_state,
			estimated_repair_cost: input.estimatedRepairCost ?? check.estimated_repair_cost,
			dispute_state: DISPUTE_STATE.DISPUTED,
		});
		const updatedHandover = await tx.update(COLLECTIONS.HANDOVER_SESSIONS, handoverId, {
			handover_state: HANDOVER_STATE.DISPUTED,
		});
		const round = await tx.insert(COLLECTIONS.NEGOTIATION_ROUNDS, {
			status: CMS_STATUS.PUBLISHED,
			author_id: user.id,
			asset_id: asString(handover.asset_id),
			interest_id: null,
			agreement_id: asString(handover.agreement_id),
			handover_id: handoverId,
			owner_user_id: asString(handover.owner_user_id),
			renter_user_id: asString(handover.renter_user_id),
			actor_user_id: user.id,
			actor_role: "owner",
			round_phase: ROUND_PHASE.RETURN,
			round_kind: ROUND_KIND.DAMAGE_CLAIM,
			round_state: ROUND_STATE.PROPOSED,
			message: input.message ?? null,
			proposed_patch: input.proposedPatch ?? {
				handoverItemCheckId: check.id,
				ownerClaimedState: input.ownerClaimedState,
			},
			terms_spec: {},
		});
		await appendAssetEvent(tx, {
			assetId: asString(handover.asset_id),
			eventKind: EVENT_KIND.DAMAGE_CLAIMED,
			actor: user,
			eventSpec: { handoverId, checkId: check.id, roundId: round.id },
		});
		return { handover: updatedHandover, check: updatedCheck, round };
	});
}
