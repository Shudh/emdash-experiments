import type { SettleHandoverRequest } from "../api-contracts.js";
import { requireHandoverParticipant } from "../auth.js";
import {
	ASSET_BUSINESS_STATE,
	COLLECTIONS,
	DISPUTE_STATE,
	EVENT_KIND,
	HANDOVER_STATE,
	VISIBILITY_STATE,
} from "../constants.js";
import { appendAssetEvent } from "../events.js";
import { getAssetOrThrow } from "../repositories/assets.js";
import { getHandoverOrThrow, listHandoverChecks } from "../repositories/handover.js";
import { assertAllowedAssetTransition } from "../transitions.js";
import type { DomainStore, UserContext } from "../types.js";
import { asString } from "../types.js";

export async function settleHandover(
	store: DomainStore,
	user: UserContext,
	handoverId: string,
	input: SettleHandoverRequest,
) {
	return store.transaction(async (tx) => {
		await requireHandoverParticipant(tx, user, handoverId);
		const handover = await getHandoverOrThrow(tx, handoverId);
		const asset = await getAssetOrThrow(tx, asString(handover.asset_id));
		const fromState = asString(asset.business_state);
		assertAllowedAssetTransition(fromState, ASSET_BUSINESS_STATE.MAINTENANCE, "settleHandover");
		const checks = await listHandoverChecks(tx, handoverId);
		for (const check of checks) {
			if (check.dispute_state === DISPUTE_STATE.DISPUTED) {
				await tx.update(COLLECTIONS.HANDOVER_ITEM_CHECKS, check.id, {
					dispute_state: DISPUTE_STATE.SETTLEMENT_AGREED,
				});
			}
		}
		const updatedHandover = await tx.update(COLLECTIONS.HANDOVER_SESSIONS, handoverId, {
			handover_state: HANDOVER_STATE.CLOSED,
			closed_at: tx.now(),
			summary_spec: input.settlementSpec ?? handover.summary_spec ?? {},
		});
		const updatedAsset = await tx.update(COLLECTIONS.ASSETS, asset.id, {
			business_state: ASSET_BUSINESS_STATE.MAINTENANCE,
			visibility_state: VISIBILITY_STATE.PRIVATE,
			active_handover_id: null,
			active_interest_id: null,
			active_agreement_id: null,
			active_renter_user_id: null,
		});
		await appendAssetEvent(tx, {
			assetId: asset.id,
			eventKind: EVENT_KIND.HANDOVER_SETTLED,
			actor: user,
			fromBusinessState: fromState,
			toBusinessState: ASSET_BUSINESS_STATE.MAINTENANCE,
			eventSpec: { handoverId, settlementSpec: input.settlementSpec ?? {} },
		});
		return { handover: updatedHandover, asset: updatedAsset };
	});
}
