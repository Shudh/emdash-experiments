import {
	ASSET_BUSINESS_STATE,
	COLLECTIONS,
	EVENT_KIND,
	HANDOVER_STATE,
	VISIBILITY_STATE,
} from "../constants.js";
import { appendAssetEvent } from "../events.js";
import { assertOperationAllowed } from "../operations.js";
import { resolveHandoverRelationship } from "../relationship.js";
import { getAssetOrThrow } from "../repositories/assets.js";
import { getHandoverOrThrow } from "../repositories/handover.js";
import { assertAllowedAssetTransition } from "../transitions.js";
import type { DomainStore, UserContext } from "../types.js";
import { asString } from "../types.js";

export async function acceptHandover(store: DomainStore, user: UserContext, handoverId: string) {
	return store.transaction(async (tx) => {
		const relationship = await resolveHandoverRelationship(tx, user, handoverId);
		const handover = await getHandoverOrThrow(tx, handoverId);
		const asset = await getAssetOrThrow(tx, asString(handover.asset_id));
		const fromState = asString(asset.business_state);
		const handoverKind = asString(handover.handover_kind);
		assertOperationAllowed({
			operationId: "handover.tenant_accept_move_in",
			relationship: relationship.role,
			asset,
			payload: handoverKind,
		});
		const nextState = ASSET_BUSINESS_STATE.RENTED;
		assertAllowedAssetTransition(fromState, nextState, "acceptHandover");
		const updatedHandover = await tx.update(COLLECTIONS.HANDOVER_SESSIONS, handoverId, {
			handover_state: HANDOVER_STATE.ACCEPTED,
			accepted_at: tx.now(),
		});
		const updatedAsset = await tx.update(COLLECTIONS.ASSETS, asset.id, {
			business_state: nextState,
			visibility_state: VISIBILITY_STATE.RESTRICTED,
		});
		await appendAssetEvent(tx, {
			assetId: asset.id,
			eventKind: EVENT_KIND.HANDOVER_ACCEPTED,
			actor: user,
			fromBusinessState: fromState,
			toBusinessState: nextState,
			eventSpec: { handoverId },
		});
		return { handover: updatedHandover, asset: updatedAsset };
	});
}
