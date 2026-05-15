import type { AddNegotiationRoundRequest } from "../api-contracts.js";
import { requireInterestParticipant } from "../auth.js";
import {
	ASSET_BUSINESS_STATE,
	CMS_STATUS,
	COLLECTIONS,
	EVENT_KIND,
	INTEREST_STATE,
	ROUND_STATE,
} from "../constants.js";
import { appendAssetEvent } from "../events.js";
import { getAssetOrThrow } from "../repositories/assets.js";
import { getInterestOrThrow } from "../repositories/interests.js";
import { assertAllowedAssetTransition } from "../transitions.js";
import type { DomainStore, UserContext } from "../types.js";
import { DomainError, asString } from "../types.js";

export async function addNegotiationRound(
	store: DomainStore,
	user: UserContext,
	interestId: string,
	input: AddNegotiationRoundRequest,
) {
	await requireInterestParticipant(store, user, interestId);
	const interest = await getInterestOrThrow(store, interestId);
	const ownerUserId = asString(interest.owner_user_id);
	const renterUserId = asString(interest.interested_user_id);
	const actorRole = user.id === ownerUserId ? "owner" : user.id === renterUserId ? "renter" : null;
	if (!actorRole) throw new DomainError("FORBIDDEN", "Interest participant access required", 403);
	const assetId = asString(interest.asset_id);
	const asset = await getAssetOrThrow(store, assetId);
	const fromState = asString(asset.business_state);
	const round = await store.insert(COLLECTIONS.NEGOTIATION_ROUNDS, {
		status: CMS_STATUS.PUBLISHED,
		author_id: user.id,
		asset_id: assetId,
		interest_id: interestId,
		agreement_id: null,
		handover_id: null,
		owner_user_id: ownerUserId,
		renter_user_id: renterUserId,
		actor_user_id: user.id,
		actor_role: actorRole,
		round_phase: input.roundPhase,
		round_kind: input.roundKind,
		round_state: input.roundState ?? ROUND_STATE.PROPOSED,
		price: input.price ?? null,
		currency: input.currency ?? asString(asset.currency, "INR"),
		minimum_months: input.minimumMonths ?? null,
		km_limit: input.kmLimit ?? null,
		deposit_amount: input.depositAmount ?? null,
		start_date: input.startDate ?? null,
		end_date: input.endDate ?? null,
		message: input.message ?? null,
		proposed_patch: input.proposedPatch ?? {},
		terms_spec: input.termsSpec ?? {},
	});
	let updatedAsset = asset;
	if (fromState === ASSET_BUSINESS_STATE.INTEREST_RECEIVED) {
		assertAllowedAssetTransition(
			fromState,
			ASSET_BUSINESS_STATE.NEGOTIATING,
			"addNegotiationRound",
		);
		updatedAsset = await store.update(COLLECTIONS.ASSETS, assetId, {
			business_state: ASSET_BUSINESS_STATE.NEGOTIATING,
		});
		await store.update(COLLECTIONS.ASSET_INTERESTS, interestId, {
			interest_state: INTEREST_STATE.NEGOTIATING,
		});
	}
	await appendAssetEvent(store, {
		assetId,
		eventKind: EVENT_KIND.NEGOTIATION_ROUND_ADDED,
		actor: user,
		fromBusinessState: fromState,
		toBusinessState: asString(updatedAsset.business_state),
		eventSpec: { interestId, roundId: round.id, roundKind: input.roundKind },
	});
	return { round, asset: updatedAsset };
}
